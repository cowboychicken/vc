import { describe, expect, it } from "vitest";
import { botMove, heuristicBot } from "../src/bots";
import { applyMove, makeRng, newGame, viewFor, type GameState } from "../src/engine";
import {
  MAX_ANIMATED,
  FINAL_PLAY_MS,
  type PresenterAction,
  type PresenterState,
  type Timing,
  initialPresenter,
  nextStep,
  presenterReducer,
} from "../src/net/presenter";
import type { Frame } from "../src/net/protocol";

const timing: Timing = { gap: 100, think: 300 };

/** Real frames from a real game, seen from seat 0. Seat 0's own moves are marked as a person's. */
function gameFrames(seed = 28, leader = 1, moves = 12): Frame[] {
  let state: GameState = newGame({ seed, leader });
  const frames: Frame[] = [{ n: 0, kind: "deal", by: -1, bot: false, view: viewFor(state, 0) }];
  for (let i = 0; i < moves && state.winner === null; i++) {
    const by = state.turn;
    state = applyMove(state, botMove(state, heuristicBot, makeRng(seed * 31 + state.history.length)));
    frames.push({ n: frames.length, kind: "move", by, bot: by !== 0, view: viewFor(state, 0) });
  }
  return frames;
}

/** Runs the presenter to rest, recording what it did and how long it waited. */
function drain(start: PresenterState) {
  const steps: { delay: number; type: string; shown: number }[] = [];
  let state = start;
  for (let i = 0; i < 100; i++) {
    const step = nextStep(state, timing);
    if (!step) break;
    state = presenterReducer(state, step.action);
    steps.push({ delay: step.delay, type: step.action.type, shown: state.shown?.n ?? -1 });
  }
  return { state, steps };
}

const push = (state: PresenterState, frames: Frame[]) => presenterReducer(state, { type: "frames", frames });

describe("presenter", () => {
  it("on first sight shows the latest frame at once, without replaying the game", () => {
    const frames = gameFrames();
    const state = push(initialPresenter(), frames);
    expect(state.shown).toBe(frames[frames.length - 1]);
    expect(state.pending).toEqual([]);
    expect(state.lit).toBe(true);
    expect(state.lastN).toBe(frames.length - 1);
    expect(nextStep(state, timing)).toBeNull();
  });

  it("shows a new room's deal first while retaining its queued bot moves", () => {
    const frames = gameFrames();
    const state = presenterReducer(initialPresenter(), {
      type: "frames",
      frames: frames.slice(0, 4),
      animateInitialDeal: true,
    });
    expect(state.shown).toBe(frames[0]);
    expect(state.pending).toEqual(frames.slice(1, 4));
    expect(state.lastN).toBe(3);
    expect(state.animateDeal).toBe(true);
  });

  it("does not replay a deal when joining an already advanced game", () => {
    const frames = gameFrames();
    const state = presenterReducer(initialPresenter(), {
      type: "frames",
      frames: frames.slice(1, 4),
      animateInitialDeal: true,
    });
    expect(state.shown).toBe(frames[3]);
    expect(state.pending).toEqual([]);
    expect(state.animateDeal).toBe(false);
  });

  it("does not animate a deal snapshot when joining an existing room", () => {
    const state = push(initialPresenter(), [gameFrames()[0]!]);
    expect(state.shown?.kind).toBe("deal");
    expect(state.animateDeal).toBe(false);
  });

  it("ignores frames it has already seen, and sorts a batch that arrives out of order", () => {
    const frames = gameFrames();
    const first = push(initialPresenter(), frames.slice(0, 3));
    expect(push(first, frames.slice(0, 3))).toBe(first);
    expect(push(first, [])).toBe(first);
    const shuffled = push(first, [frames[5]!, frames[3]!, frames[4]!]);
    expect(shuffled.pending.map((f) => f.n)).toEqual([3, 4, 5]);
    expect(shuffled.lastN).toBe(5);
  });

  it("plays bot moves as: bot is lit, its card lands, pause, next bot lights, and so on", () => {
    const frames = gameFrames();
    // Seat 1 leads, so frames 1.. are bot moves until it is seat 0's turn.
    const botRun = frames.slice(1).filter((f) => f.bot);
    expect(botRun.length).toBeGreaterThanOrEqual(3);
    const seen = push(initialPresenter(), [frames[0]!]);
    expect(seen.lit).toBe(true); // the opening bot is already lit from the deal, as in single-player
    const { state, steps } = drain(push(seen, botRun.slice(0, 3)));

    expect(steps.map((s) => [s.type, s.delay])).toEqual([
      ["show", timing.think],
      ["light", timing.gap],
      ["show", timing.think],
      ["light", timing.gap],
      ["show", timing.think],
    ]);
    expect(steps.filter((s) => s.type === "show").map((s) => s.shown)).toEqual(botRun.slice(0, 3).map((f) => f.n));
    expect(state.pending).toEqual([]);
    expect(state.lit).toBe(true);
  });

  it("lights the opening bot straight away when a new game's deal arrives behind a finished one", () => {
    const frames = gameFrames();
    const over: Frame = { ...frames[2]!, n: 50, view: { ...frames[2]!.view, winner: 2 } };
    const deal: Frame = { ...frames[0]!, n: 51 };
    const nextGame = [deal, { ...frames[1]!, n: 52 }, { ...frames[2]!, n: 53 }];
    const state = push(push(initialPresenter(), [over]), nextGame);
    const { steps } = drain(state);
    expect(steps.map((s) => [s.type, s.delay])).toEqual([
      ["show", FINAL_PLAY_MS], // leave the winning play visible before the next deal
      ["light", 0], // the opening bot, with no pause because nothing has been played
      ["show", timing.think],
      ["light", timing.gap],
      ["show", timing.think],
    ]);
  });

  it("is not lit between a move and the next bot's beat", () => {
    const frames = gameFrames();
    let state = push(initialPresenter(), [frames[0]!]);
    state = push(state, frames.slice(1, 3));
    state = presenterReducer(state, { type: "light" });
    state = presenterReducer(state, { type: "show" });
    expect(state.shown!.n).toBe(1);
    expect(state.pending).toHaveLength(1);
    expect(state.lit).toBe(false);
  });

  it("shows a person's move the moment it arrives, then animates the bots after it", () => {
    const frames = gameFrames(5, 0, 8); // seat 0 leads, then bots reply
    const human = frames[1]!;
    expect(human.bot).toBe(false);
    const seen = push(initialPresenter(), [frames[0]!]);
    const arrived = push(seen, frames.slice(1, 4));
    const first = nextStep(arrived, timing)!;
    expect(first).toEqual({ delay: 0, action: { type: "show" } });
    const afterHuman = presenterReducer(arrived, first.action);
    expect(afterHuman.shown).toBe(human);
    expect(afterHuman.lit).toBe(false);
    expect(nextStep(afterHuman, timing)).toEqual({ delay: timing.gap, action: { type: "light" } });
  });

  it("holds the winning play before showing a new deal", () => {
    const frames = gameFrames();
    const over: Frame = { ...frames[2]!, n: 20, view: { ...frames[2]!.view, winner: 2 } };
    const deal: Frame = { ...frames[0]!, n: 21 };
    const state = push(push(initialPresenter(), [over]), [deal]);
    expect(nextStep(state, timing)).toEqual({ delay: FINAL_PLAY_MS, action: { type: "show" } });
    const { state: end } = drain(state);
    expect(end.shown!.kind).toBe("deal");
    expect(end.lit).toBe(true);
  });

  it("skips ahead when far behind, instead of replaying a long backlog", () => {
    const frames = gameFrames(28, 1, 30);
    expect(frames.length).toBeGreaterThan(MAX_ANIMATED + 2);
    const seen = push(initialPresenter(), [frames[0]!]);
    const behind = push(seen, frames.slice(1, MAX_ANIMATED + 2));
    expect(behind.pending).toEqual([]);
    expect(behind.shown).toBe(frames[MAX_ANIMATED + 1]);
    expect(behind.lit).toBe(true);
    const justEnough = push(seen, frames.slice(1, MAX_ANIMATED + 1));
    expect(justEnough.pending).toHaveLength(MAX_ANIMATED);
  });

  it("applies the viewer's own timing", () => {
    const frames = gameFrames();
    const state = push(push(initialPresenter(), [frames[0]!]), frames.slice(1, 3));
    const slow = nextStep(presenterReducer(state, { type: "light" }), { gap: 900, think: 1400 })!;
    expect(slow.delay).toBe(1400);
    const none: PresenterAction = { type: "show" };
    expect(presenterReducer(initialPresenter(), none)).toEqual(initialPresenter());
  });

  it("can be reset when leaving a room", () => {
    const state = push(initialPresenter(), gameFrames());
    expect(presenterReducer(state, { type: "reset" })).toEqual(initialPresenter());
  });
});
