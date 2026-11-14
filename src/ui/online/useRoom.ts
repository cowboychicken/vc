import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { BotLevel } from "../../bots";
import type { Move, RuleOptions } from "../../engine";
import {
  ApiError,
  createRoom,
  getUpdates,
  joinRoom,
  leaveRoom,
  sendMove,
  sendProfile,
  sendSettings,
  startGame,
} from "../../net/client";
import { type PresenterState, type Timing, initialPresenter, nextStep, presenterReducer } from "../../net/presenter";
import type { JoinResponse, Profile, RoomInfo, UpdateResponse } from "../../net/protocol";
import type { OnlineIntent } from "./intent";
import { setAddress } from "../url";
import { forgetSeatToken, loadSeatToken, saveSeatToken } from "./seats";

export type Status = "joining" | "connected" | "reconnecting" | "failed";

export interface Prefs {
  rules: RuleOptions;
  botLevel: BotLevel;
}

export interface RoomHandle {
  status: Status;
  /** Why joining or staying in the room failed. */
  error: string | null;
  /** A short message about the last thing the player tried, like "It isn't your turn." */
  notice: string | null;
  code: string | null;
  seat: number | null;
  room: RoomInfo | null;
  presenter: PresenterState;
  move: (move: Move) => void;
  start: (dealCode?: string) => void;
  setSettings: (patch: { rules?: RuleOptions; botLevel?: BotLevel }) => void;
  setProfile: (profile: Profile) => void;
  /** Gives up the seat and stops polling. Resolves once the server has been told. */
  leave: () => Promise<void>;
}

// React runs effects twice in development. Whatever the first run asks of the server is shared with
// the second, so a room (or a seat) is never made twice.
const joins = new WeakMap<OnlineIntent, Promise<JoinResponse>>();

/** There is no lobby: a new room deals its first game at once, and friends who arrive take a bot's seat. */
async function createAndDeal(profile: Profile, prefs: Prefs): Promise<JoinResponse> {
  const created = await createRoom(profile, prefs);
  const dealt = await startGame(created.room.code, created.token, -1);
  return { ...dealt, token: created.token };
}

function joinOnce(intent: OnlineIntent, profile: Profile, prefs: Prefs): Promise<JoinResponse> {
  let promise = joins.get(intent);
  if (!promise) {
    promise =
      intent.type === "create"
        ? createAndDeal(profile, prefs)
        : joinRoom(intent.code, profile, loadSeatToken(intent.code));
    joins.set(intent, promise);
  }
  return promise;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const POLL_SECONDS = 25;
const MIN_IDLE_POLL_MS = 1000;

export function useRoom(intent: OnlineIntent, profile: Profile, prefs: Prefs, timing: Timing): RoomHandle {
  const [status, setStatus] = useState<Status>("joining");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [code, setCode] = useState<string | null>(intent.type === "join" ? intent.code : null);
  const [presenter, dispatch] = useReducer(presenterReducer, undefined, initialPresenter);

  const token = useRef<string | null>(null);
  const joinedCode = useRef<string | null>(null);
  const rev = useRef(-1);
  const since = useRef(-1);
  const poll = useRef<AbortController | null>(null);
  const leaving = useRef(false);
  const latest = useRef({ profile, prefs });
  latest.current = { profile, prefs };

  const apply = useCallback((update: UpdateResponse) => {
    if (update.room.rev >= rev.current) {
      rev.current = update.room.rev;
      setRoom(update.room);
      setSeat(update.seat);
    }
    if (update.frames.length > 0) {
      since.current = Math.max(since.current, ...update.frames.map((f) => f.n));
      dispatch({ type: "frames", frames: update.frames });
    }
  }, []);

  // Plays the server's frames back one beat at a time.
  useEffect(() => {
    const step = nextStep(presenter, timing);
    if (!step) return;
    const id = window.setTimeout(() => dispatch(step.action), step.delay);
    return () => window.clearTimeout(id);
  }, [presenter, timing]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    leaving.current = false;
    const over = () => cancelled || leaving.current;

    const fail = (message: string) => {
      setError(message);
      setStatus("failed");
    };
    // Cuts the current wait short so the next poll starts now (page visible again, network back).
    const nudge = () => poll.current?.abort();
    const onVisible = () => {
      if (!document.hidden) nudge();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", nudge);

    const run = async () => {
      // Every join starts from a clean slate, so numbers from an earlier room can never leak in.
      rev.current = -1;
      since.current = -1;
      dispatch({ type: "reset" });

      let joined: JoinResponse;
      try {
        joined = await joinOnce(intent, latest.current.profile, latest.current.prefs);
      } catch (e) {
        if (!cancelled) fail(e instanceof ApiError ? e.message : "Couldn't join the room.");
        return;
      }
      if (cancelled) return;

      const roomCode = joined.room.code;
      token.current = joined.token;
      joinedCode.current = roomCode;
      setCode(roomCode);
      saveSeatToken(roomCode, joined.token);
      if (intent.type === "create") setAddress(`?room=${roomCode}`);
      apply(joined);
      setStatus("connected");

      let failures = 0;
      while (!over()) {
        const controller = new AbortController();
        poll.current = controller;
        const started = Date.now();
        const seen = { rev: rev.current, since: since.current };
        try {
          const update = await getUpdates(roomCode, token.current!, {
            since: since.current,
            rev: rev.current,
            // After a failure, ask for an immediate answer: a long poll on a quiet room could keep the
            // "Reconnecting…" banner up for 25 seconds after the network is already back.
            wait: failures > 0 ? 0 : POLL_SECONDS,
            signal: controller.signal,
          });
          if (over()) return;
          failures = 0;
          setStatus("connected");
          apply(update);
          // A poll that comes straight back with nothing new must not turn into a tight loop.
          const idle = rev.current === seen.rev && since.current === seen.since;
          const took = Date.now() - started;
          if (idle && took < MIN_IDLE_POLL_MS) await sleep(MIN_IDLE_POLL_MS - took);
        } catch (e) {
          if (over()) return; // leaving on purpose: never poll again, and never re-take a seat
          if (controller.signal.aborted) continue; // nudged; go again straight away
          if (e instanceof ApiError && e.status === 401) {
            // The server no longer knows this seat (it expired, or the server restarted). Ask for a fresh one.
            try {
              const again = await joinRoom(roomCode, latest.current.profile);
              token.current = again.token;
              saveSeatToken(roomCode, again.token);
              rev.current = -1;
              since.current = -1;
              dispatch({ type: "reset" });
              apply(again);
              continue;
            } catch {
              forgetSeatToken(roomCode);
              return fail("You are no longer in this room.");
            }
          }
          if (e instanceof ApiError && (e.status === 404 || e.code === "outdated")) {
            if (e.status === 404) forgetSeatToken(roomCode);
            return fail(e.message);
          }
          failures++;
          setStatus("reconnecting");
          await sleep(Math.min(500 * 2 ** (failures - 1), 8000));
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
      poll.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", nudge);
    };
  }, [intent, apply]);

  const act = useCallback(
    async (call: (roomCode: string, seatToken: string, since: number) => Promise<UpdateResponse>) => {
      if (!token.current || !joinedCode.current) return;
      try {
        apply(await call(joinedCode.current, token.current, since.current));
        setNotice(null);
      } catch (e) {
        setNotice(e instanceof ApiError ? e.message : "Something went wrong.");
      }
    },
    [apply],
  );

  return {
    status,
    error,
    notice,
    code,
    seat,
    room,
    presenter,
    move: (move) => void act((c, t, s) => sendMove(c, t, move, s)),
    start: (dealCode) => void act((c, t, s) => startGame(c, t, s, dealCode)),
    setSettings: (patch) => void act((c, t, s) => sendSettings(c, t, s, patch)),
    setProfile: (next) => void act((c, t, s) => sendProfile(c, t, s, next)),
    leave: async () => {
      leaving.current = true;
      poll.current?.abort();
      const roomCode = joinedCode.current;
      const seatToken = token.current;
      if (roomCode) forgetSeatToken(roomCode);
      if (roomCode && seatToken) {
        try {
          await leaveRoom(roomCode, seatToken);
        } catch {
          // already gone, or the network is down; the seat expires by itself
        }
      }
    },
  };
}
