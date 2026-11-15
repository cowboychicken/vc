import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { BOT_BY_LEVEL, type BotLevel, botMove } from "../src/bots";
import {
  DEFAULT_RULES,
  type GameState,
  type Move,
  type RuleOptions,
  applyMove,
  decodeDeal,
  encodeDeal,
  makeRng,
  newGame,
  viewFor,
} from "../src/engine";
import {
  type ColorId,
  type ErrorCode,
  type Frame,
  NUM_SEATS,
  type Phase,
  type Profile,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomInfo,
  type UpdateResponse,
  botName,
  uniqueName,
} from "../src/net/protocol";

export class RoomError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ManagerOptions {
  now?: () => number;
  /** A random integer in [0, max). Replaceable so tests can be deterministic. */
  randomInt?: (max: number) => number;
  randomToken?: () => string;
  maxRooms?: number;
  /** How long a human can go unheard before a bot covers their turns. */
  awayMs?: number;
  /** How long a present human has to move before a bot plays for them. */
  turnMs?: number;
  /** Extra time added to every turn deadline, so the client's playback of earlier moves doesn't eat into `turnMs`. */
  turnGraceMs?: number;
  /** Timeouts in one seat's stay in a room before the seat is taken away. */
  maxStrikes?: number;
  /** How long a room with nobody around is kept. */
  emptyRoomMs?: number;
  /** Frames kept per room, and the most sent in one response. */
  keepFrames?: number;
  maxFramesPerResponse?: number;
}

interface Seat {
  kind: "human" | "bot";
  playerId: number;
  name: string;
  color: ColorId | null;
  token: string | null;
  lastSeen: number;
  /** The away flag clients were last told about. */
  shownAway: boolean;
  /** Turns this player let run out in this stay. A bot seat's are always 0; leaving or being replaced resets them. */
  strikes: number;
}

interface Participant {
  id: number;
  kind: "human" | "bot";
  name: string;
  token: string | null;
  games: number;
  wins: number;
}

interface StoredFrame {
  n: number;
  kind: "deal" | "move";
  by: number;
  bot: boolean;
  state: GameState;
}

interface Room {
  code: string;
  rev: number;
  phase: Phase;
  seats: Seat[];
  host: number;
  rules: RuleOptions;
  botLevel: BotLevel;
  games: number;
  wins: number[];
  participants: Participant[];
  /** Tokens that may not return, and why. */
  kickedTokens: Map<string, "host" | "idle">;
  /** The human turn being timed: `key` changes with every frame, so a new move restarts the clock. */
  turn: { key: number; seat: number; deadline: number } | null;
  gameParticipants: Set<number>;
  lastWinner: number | null;
  game: GameState | null;
  dealCode: string | null;
  frames: StoredFrame[];
  nextN: number;
  lastActive: number;
}

const MAX_BOT_MOVES = 1000;
const MAX_ROOM_HUMANS = 100;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly now: () => number;
  private readonly rand: (max: number) => number;
  private readonly newToken: () => string;
  private readonly maxRooms: number;
  private readonly awayMs: number;
  private readonly turnMs: number;
  private readonly turnGraceMs: number;
  private readonly maxStrikes: number;
  private readonly emptyRoomMs: number;
  private readonly keepFrames: number;
  private readonly maxFramesPerResponse: number;

  constructor(options: ManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.rand = options.randomInt ?? ((max) => randomInt(max));
    this.newToken = options.randomToken ?? (() => randomBytes(16).toString("hex"));
    this.maxRooms = options.maxRooms ?? 200;
    this.awayMs = options.awayMs ?? 45_000;
    this.turnMs = options.turnMs ?? 15_000;
    this.turnGraceMs = options.turnGraceMs ?? 4_000;
    this.maxStrikes = options.maxStrikes ?? 3;
    this.emptyRoomMs = options.emptyRoomMs ?? 30 * 60_000;
    this.keepFrames = options.keepFrames ?? 40;
    this.maxFramesPerResponse = options.maxFramesPerResponse ?? 12;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** How many pollers are waiting on a room. For tests and diagnostics. */
  listenerCount(code: string): number {
    return this.listeners.get(code)?.size ?? 0;
  }

  // --- Joining and leaving ---------------------------------------------------------------------

  create(profile: Profile, prefs: { rules?: RuleOptions; botLevel?: BotLevel } = {}): { code: string; token: string } {
    if (this.rooms.size >= this.maxRooms) {
      throw new RoomError(429, "rate_limited", "The server is full of rooms right now. Try again soon.");
    }
    let code: string;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[this.rand(ROOM_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    const token = this.newToken();
    const now = this.now();
    const participants: Participant[] = Array.from({ length: NUM_SEATS }, (_, id) => ({
      id, kind: "bot", name: botName(id), token: null, games: 0, wins: 0,
    }));
    participants.push({ id: NUM_SEATS, kind: "human", name: "", token, games: 0, wins: 0 });
    const seats: Seat[] = Array.from({ length: NUM_SEATS }, (_, i) => this.botSeat(i, now));
    seats[0] = { kind: "human", playerId: NUM_SEATS, name: this.nameFor(profile.name, seats, 0), color: profile.color, token, lastSeen: now, shownAway: false, strikes: 0 };
    participants[NUM_SEATS]!.name = seats[0].name;
    this.rooms.set(code, {
      code,
      rev: 1,
      phase: "lobby",
      seats,
      host: 0,
      rules: prefs.rules ?? DEFAULT_RULES,
      botLevel: prefs.botLevel ?? "normal",
      games: 0,
      wins: new Array<number>(NUM_SEATS).fill(0),
      participants,
      kickedTokens: new Map(),
      turn: null,
      gameParticipants: new Set(),
      lastWinner: null,
      game: null,
      dealCode: null,
      frames: [],
      nextN: 0,
      lastActive: now,
    });
    return { code, token };
  }

  /** Takes a seat, retaining a returning player's room stats. */
  join(code: string, profile: Profile, token?: string): { token: string } {
    const room = this.room(code);
    const now = this.now();
    room.lastActive = now;
    const removed = token ? room.kickedTokens.get(token) : undefined;
    if (removed) {
      throw new RoomError(
        403,
        "forbidden",
        removed === "idle"
          ? "You were removed from this room after running out of time too many times."
          : "The host removed you from this room.",
      );
    }
    const existing = token ? this.seatOf(room, token) : -1;
    if (existing >= 0) {
      const seat = room.seats[existing]!;
      seat.lastSeen = now;
      seat.name = this.nameFor(profile.name, room.seats, existing);
      seat.color = profile.color;
      room.participants[seat.playerId]!.name = seat.name;
      this.refreshAway(room);
      this.touch(room);
      return { token: seat.token! };
    }
    const free = room.seats.findIndex((s) => s.kind === "bot");
    if (free < 0) throw new RoomError(409, "conflict", "This room is full.");
    let participant = token ? room.participants.find((p) => p.token !== null && safeEqual(p.token, token)) : undefined;
    if (!participant) {
      if (room.participants.length - NUM_SEATS >= MAX_ROOM_HUMANS) {
        throw new RoomError(429, "rate_limited", "This room has reached its player history limit.");
      }
      participant = { id: room.participants.length, kind: "human", name: "", token: this.newToken(), games: 0, wins: 0 };
      room.participants.push(participant);
    }
    const newToken = participant.token!;
    room.seats[free] = {
      kind: "human",
      playerId: participant.id,
      name: this.nameFor(profile.name, room.seats, free),
      color: profile.color,
      token: newToken,
      lastSeen: now,
      shownAway: false,
      strikes: 0,
    };
    participant.name = room.seats[free]!.name;
    if (room.phase === "playing") room.gameParticipants.add(participant.id);
    this.touch(room);
    return { token: newToken };
  }

  /** Picks a random room with a present human and a bot seat, or returns null. */
  randomJoinableRoom(): string | null {
    const candidates = [...this.rooms.values()].filter((room) =>
      room.seats.some((seat) => seat.kind === "human" && !this.isAway(seat)) &&
      room.seats.some((seat) => seat.kind === "bot"),
    );
    return candidates.length > 0 ? candidates[this.rand(candidates.length)]!.code : null;
  }

  leave(code: string, token: string): void {
    const room = this.room(code);
    const seat = this.auth(room, token);
    room.seats[seat] = this.botSeat(seat, this.now());
    if (room.phase === "playing") room.gameParticipants.add(room.seats[seat]!.playerId);
    if (!room.seats.some((s) => s.kind === "human")) {
      this.deleteRoom(room);
      return;
    }
    if (room.host === seat) room.host = this.firstHuman(room, true);
    this.advanceBots(room);
    this.touch(room);
  }

  kick(code: string, token: string, targetSeat: number): void {
    const room = this.room(code);
    const host = this.auth(room, token);
    this.requireHost(room, host);
    if (!Number.isInteger(targetSeat) || targetSeat < 0 || targetSeat >= NUM_SEATS) {
      throw new RoomError(400, "bad_request", "That seat is invalid.");
    }
    if (targetSeat === host || room.seats[targetSeat]!.kind !== "human") {
      throw new RoomError(409, "conflict", "That seat can't be removed.");
    }

    const target = room.seats[targetSeat]!;
    if (target.token) room.kickedTokens.set(target.token, "host");
    room.seats[targetSeat] = this.botSeat(targetSeat, this.now());
    if (room.phase === "playing") room.gameParticipants.add(room.seats[targetSeat]!.playerId);
    this.advanceBots(room);
    this.touch(room);
  }

  setProfile(code: string, token: string, profile: Profile): void {
    const room = this.room(code);
    const seat = this.auth(room, token);
    room.seats[seat]!.name = this.nameFor(profile.name, room.seats, seat);
    room.seats[seat]!.color = profile.color;
    room.participants[room.seats[seat]!.playerId]!.name = room.seats[seat]!.name;
    this.touch(room);
  }

  // --- Host actions ----------------------------------------------------------------------------

  setSettings(code: string, token: string, patch: { rules?: RuleOptions; botLevel?: BotLevel }): void {
    const room = this.room(code);
    this.requireHost(room, this.auth(room, token));
    if (patch.rules !== undefined) {
      if (room.phase === "playing") throw new RoomError(409, "conflict", "Rules can only change between games.");
      room.rules = patch.rules;
    }
    if (patch.botLevel !== undefined) room.botLevel = patch.botLevel;
    this.touch(room);
  }

  /**
   * Starts the first game, or the next one. The deal is random. `dealCode` exists so tests can fix a deal;
   * the HTTP layer never passes one, so players can't choose or replay a deal.
   */
  start(code: string, token: string, dealCode?: string): void {
    const room = this.room(code);
    this.requireHost(room, this.auth(room, token));
    if (room.phase === "playing") throw new RoomError(409, "conflict", "A game is already running.");
    let seed: number;
    let leader: number | undefined;
    if (dealCode !== undefined && dealCode.trim() !== "") {
      const deal = decodeDeal(dealCode);
      if (!deal) throw new RoomError(400, "bad_request", "That isn't a valid deal code.");
      ({ seed, leader } = deal);
    } else {
      seed = this.rand(2 ** 32);
      // The first game opens with the 3♠; after that the last winner leads.
      leader = room.lastWinner ?? undefined;
    }
    const game = newGame({ seed, leader, rules: room.rules });
    room.game = game;
    room.gameParticipants = new Set(room.seats.map((seat) => seat.playerId));
    room.dealCode = encodeDeal({ seed, leader });
    this.push(room, "deal", -1, false, game);
    if (game.winner !== null) this.finish(room);
    else {
      room.phase = "playing";
      this.advanceBots(room);
    }
    this.touch(room);
  }

  // --- Playing ---------------------------------------------------------------------------------

  move(code: string, token: string, move: Move): void {
    const room = this.room(code);
    const seat = this.auth(room, token);
    if (room.phase !== "playing" || !room.game) throw new RoomError(409, "conflict", "There is no game in progress.");
    if (room.game.turn !== seat) throw new RoomError(409, "conflict", "It isn't your turn.");
    let next: GameState;
    try {
      next = applyMove(room.game, move);
    } catch (error) {
      throw new RoomError(400, "bad_request", error instanceof Error ? error.message : "Illegal move.");
    }
    room.seats[seat]!.lastSeen = this.now();
    this.apply(room, seat, false, next);
    this.advanceBots(room);
    this.touch(room);
  }

  // --- Reading ---------------------------------------------------------------------------------

  /** What a seat needs to catch up: the room, and the frames after `since`. Also counts as being present. */
  update(code: string, token: string, since: number): UpdateResponse {
    const room = this.room(code);
    const seat = this.auth(room, token);
    const now = this.now();
    room.seats[seat]!.lastSeen = now;
    room.lastActive = now;
    if (this.refreshAway(room)) this.touch(room);
    return this.response(room, seat, since);
  }

  /** Public details of a room, for a join screen. */
  peek(code: string): RoomInfo | null {
    const room = this.rooms.get(code);
    return room ? this.info(room) : null;
  }

  /** Marks a seat as present without building a response. Used when a long poll starts. */
  seen(code: string, token: string): void {
    const room = this.room(code);
    const seat = this.auth(room, token);
    const now = this.now();
    room.seats[seat]!.lastSeen = now;
    room.lastActive = now;
    if (this.refreshAway(room)) this.touch(room);
  }

  /** True if the seat's client is out of date and a long poll should answer straight away. */
  hasNews(code: string, token: string, since: number, rev: number): boolean {
    const room = this.room(code);
    this.auth(room, token);
    const lastN = room.frames.length > 0 ? room.frames[room.frames.length - 1]!.n : -1;
    return room.rev !== rev || lastN > since;
  }

  /** Calls back whenever the room changes, or goes away. */
  subscribe(code: string, callback: () => void): () => void {
    let set = this.listeners.get(code);
    if (!set) this.listeners.set(code, (set = new Set()));
    set.add(callback);
    return () => {
      set.delete(callback);
      // Only drop the entry if it is still this set; a later subscriber may have created a new one.
      if (set.size === 0 && this.listeners.get(code) === set) this.listeners.delete(code);
    };
  }

  /** Housekeeping for the clock: absent players, host handover, covering bots, expired rooms. */
  sweep(): string[] {
    const changed: string[] = [];
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      let dirty = this.refreshAway(room);
      if (this.isAway(room.seats[room.host]!)) {
        const next = this.firstHuman(room, true);
        if (next !== room.host && !this.isAway(room.seats[next]!)) {
          room.host = next;
          dirty = true;
        }
      }
      // Bots cover away players first, so only a present human's turn can time out.
      if (this.advanceBots(room)) dirty = true;
      if (this.expireTurn(room)) dirty = true;
      if (!this.rooms.has(room.code)) {
        changed.push(room.code);
        continue;
      }
      const anyonePresent = room.seats.some((s) => s.kind === "human" && !this.isAway(s));
      if (!anyonePresent && now - room.lastActive > this.emptyRoomMs) {
        this.deleteRoom(room);
        changed.push(room.code);
        continue;
      }
      if (dirty) {
        this.touch(room);
        changed.push(room.code);
      }
    }
    return changed;
  }

  // --- Internals -------------------------------------------------------------------------------

  private room(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError(404, "not_found", "That room doesn't exist any more.");
    return room;
  }

  private seatOf(room: Room, token: string): number {
    return room.seats.findIndex((s) => s.token !== null && safeEqual(s.token, token));
  }

  private auth(room: Room, token: string): number {
    const seat = token ? this.seatOf(room, token) : -1;
    if (seat < 0) throw new RoomError(401, "unauthorized", "You are no longer in this room.");
    room.lastActive = this.now(); // only a player acting counts as activity, never the server's own housekeeping
    return seat;
  }

  private requireHost(room: Room, seat: number): void {
    if (room.host !== seat) throw new RoomError(403, "forbidden", "Only the host can do that.");
  }

  private botSeat(index: number, now: number): Seat {
    return { kind: "bot", playerId: index, name: botName(index), color: null, token: null, lastSeen: now, shownAway: false, strikes: 0 };
  }

  private nameFor(wanted: string, seats: readonly Seat[], self: number): string {
    // Bot names are always reserved, so a player can never be mistaken for a bot.
    const reserved = Array.from({ length: NUM_SEATS }, (_, i) => botName(i));
    return uniqueName(wanted, [...seats.filter((_, i) => i !== self).map((s) => s.name), ...reserved]);
  }

  private isAway(seat: Seat): boolean {
    return seat.kind === "human" && this.now() - seat.lastSeen > this.awayMs;
  }

  /** Brings each seat's published away flag up to date. Returns true if any changed. */
  private refreshAway(room: Room): boolean {
    let changed = false;
    for (const seat of room.seats) {
      const away = this.isAway(seat);
      if (seat.shownAway !== away) {
        seat.shownAway = away;
        changed = true;
      }
    }
    return changed;
  }

  /** The first human seat, preferring those who are around. */
  private firstHuman(room: Room, preferPresent: boolean): number {
    const humans = room.seats.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === "human");
    const present = humans.find(({ s }) => !this.isAway(s));
    return (preferPresent && present ? present : humans[0])!.i;
  }

  private push(room: Room, kind: "deal" | "move", by: number, bot: boolean, state: GameState): void {
    room.frames.push({ n: room.nextN++, kind, by, bot, state });
    if (room.frames.length > this.keepFrames) room.frames.splice(0, room.frames.length - this.keepFrames);
  }

  private apply(room: Room, by: number, bot: boolean, next: GameState): void {
    room.game = next;
    this.push(room, "move", by, bot, next);
    if (next.winner !== null) this.finish(room);
  }

  private finish(room: Room): void {
    const winner = room.game!.winner!;
    room.games++;
    room.wins[winner]!++;
    for (const id of room.gameParticipants) room.participants[id]!.games++;
    room.participants[room.seats[winner]!.playerId]!.wins++;
    room.lastWinner = winner;
    room.phase = "over";
  }

  /** Plays for every seat that has no human in charge, until a present human is up or the game ends. */
  private advanceBots(room: Room): boolean {
    let moved = false;
    for (let i = 0; i < MAX_BOT_MOVES && room.phase === "playing" && room.game && room.game.winner === null; i++) {
      const game = room.game;
      const seat = room.seats[game.turn]!;
      if (seat.kind === "human" && !this.isAway(seat)) break;
      const rng = makeRng(game.seed * 31 + game.history.length);
      this.apply(room, game.turn, true, applyMove(game, botMove(game, BOT_BY_LEVEL[room.botLevel], rng)));
      moved = true;
    }
    this.armTurn(room);
    return moved;
  }

  /** Starts the clock when a present human becomes the one to move, and stops it otherwise. */
  private armTurn(room: Room): void {
    const game = room.game;
    if (room.phase !== "playing" || !game || game.winner !== null) {
      room.turn = null;
      return;
    }
    const seat = room.seats[game.turn]!;
    if (seat.kind !== "human" || this.isAway(seat)) {
      room.turn = null;
      return;
    }
    if (room.turn?.key === room.nextN && room.turn.seat === game.turn) return;
    room.turn = { key: room.nextN, seat: game.turn, deadline: this.now() + this.turnMs + this.turnGraceMs };
  }

  /**
   * When the human on the move has run out of time, a bot plays for them and it counts as a strike.
   * The last strike takes the seat away. Returns true if anything changed.
   */
  private expireTurn(room: Room): boolean {
    const turn = room.turn;
    if (!turn || this.now() < turn.deadline || room.phase !== "playing" || !room.game) return false;
    const seat = room.seats[turn.seat]!;
    if (seat.kind !== "human" || this.isAway(seat)) {
      room.turn = null;
      return false;
    }
    seat.strikes++;
    if (seat.strikes >= this.maxStrikes) {
      if (seat.token) room.kickedTokens.set(seat.token, "idle");
      room.seats[turn.seat] = this.botSeat(turn.seat, this.now());
      room.gameParticipants.add(room.seats[turn.seat]!.playerId);
      if (!room.seats.some((s) => s.kind === "human")) {
        this.deleteRoom(room);
        return true;
      }
      if (room.host === turn.seat) room.host = this.firstHuman(room, true);
    } else {
      const game = room.game;
      const rng = makeRng(game.seed * 31 + game.history.length);
      this.apply(room, turn.seat, true, applyMove(game, botMove(game, BOT_BY_LEVEL[room.botLevel], rng)));
    }
    room.turn = null;
    this.advanceBots(room);
    this.touch(room);
    return true;
  }

  private touch(room: Room): void {
    room.rev++;
    this.notify(room.code);
  }

  private notify(code: string): void {
    for (const callback of [...(this.listeners.get(code) ?? [])]) callback();
  }

  private deleteRoom(room: Room): void {
    this.rooms.delete(room.code);
    this.notify(room.code);
  }

  private info(room: Room): RoomInfo {
    return {
      code: room.code,
      rev: room.rev,
      phase: room.phase,
      seats: room.seats.map((s, i) => ({
        kind: s.kind,
        playerId: s.playerId,
        name: s.name,
        color: s.color,
        away: s.shownAway,
        host: i === room.host,
        strikes: s.strikes,
      })),
      maxStrikes: this.maxStrikes,
      turn: room.turn ? { seat: room.turn.seat, endsInMs: Math.max(0, room.turn.deadline - this.now()), limitMs: this.turnMs } : null,
      host: room.host,
      settings: { rules: room.rules, botLevel: room.botLevel },
      games: room.games,
      wins: [...room.wins],
      playerStats: room.participants
        .filter((p) => p.kind === "human" || p.games > 0 || room.seats.some((s) => s.playerId === p.id))
        .map((p) => ({
          id: p.id, kind: p.kind, name: p.name, games: p.games, wins: p.wins,
          present: room.seats.some((s) => s.playerId === p.id),
        })),
      dealCode: room.dealCode,
    };
  }

  private response(room: Room, seat: number, since: number): UpdateResponse {
    const frames: Frame[] = room.frames
      .filter((f) => f.n > since)
      .slice(-this.maxFramesPerResponse)
      .map((f) => ({ n: f.n, kind: f.kind, by: f.by, bot: f.bot, view: viewFor(f.state, seat) }));
    return { seat, room: this.info(room), frames };
  }
}
