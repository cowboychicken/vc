import { describe, expect, it } from "vitest";
import {
  type GameState,
  THREE_OF_SPADES,
  applyMove,
  deal,
  explainIllegalPlay,
  legalMoves,
  newGame,
  viewFor,
} from "../src/engine";
import { cs } from "./helpers";

/** A free-lead game with hand-picked cards. */
function setup(hands: string[], turn = 0): GameState {
  return { ...newGame({ seed: 1, leader: turn }), hands: hands.map(cs), winner: null, instantWin: null };
}
const play = (s: GameState, labels: string) => applyMove(s, { type: "play", cards: cs(labels) });
const pass = (s: GameState) => applyMove(s, { type: "pass" });

describe("dealing", () => {
  it("deals 13 distinct cards to each of 4 players", () => {
    const hands = deal(42);
    expect(hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(hands.flat()).size).toBe(52);
  });
  it("is deterministic per seed and differs across seeds", () => {
    expect(deal(7)).toEqual(deal(7));
    expect(deal(7)).not.toEqual(deal(8));
  });
});

describe("game start", () => {
  it("first game: the 3♠ holder leads and must open with it", () => {
    const state = newGame({ seed: 5 });
    if (state.winner !== null) return; // instant win; covered below
    expect(state.hands[state.turn]).toContain(THREE_OF_SPADES);
    expect(state.openingRequired).toBe(true);
    for (const m of legalMoves(state)) {
      expect(m.type === "play" && m.cards.includes(THREE_OF_SPADES)).toBe(true);
    }
    const other = state.hands[state.turn]!.find((c) => c !== THREE_OF_SPADES)!;
    expect(() => applyMove(state, { type: "play", cards: [other] })).toThrow(/3♠/);
  });

  it("later games: the given leader may open with anything and the 3♠ is not required", () => {
    const state = newGame({ seed: 5, leader: 2 });
    expect(state.turn).toBe(2);
    expect(state.openingRequired).toBe(false);
  });

  it("opening requirement ends after the first play", () => {
    const state = newGame({ seed: 5 });
    if (state.winner !== null) return;
    const first = legalMoves(state)[0]!;
    expect(applyMove(state, first).openingRequired).toBe(false);
  });

  it("an instant-win deal ends the game before any card is played", () => {
    let found = 0;
    for (let seed = 0; seed < 20000 && found === 0; seed++) {
      const state = newGame({ seed });
      if (state.winner !== null) {
        found++;
        expect(state.instantWin).not.toBeNull();
        expect(state.history).toEqual([]);
        expect(state.hands.every((h) => h.length === 13)).toBe(true);
        expect(() => applyMove(state, { type: "pass" })).toThrow();
      }
    }
    expect(found).toBe(1);
  });
});

describe("turn flow", () => {
  const hands = ["5♠ 9♠", "6♠ 8♥", "7♠ 10♥", "8♠ J♥"];

  it("cannot pass when leading", () => {
    const s = setup(hands);
    expect(() => pass(s)).toThrow();
    expect(legalMoves(s).some((m) => m.type === "pass")).toBe(false);
  });

  it("rejects plays that do not beat the table or are not owned", () => {
    const s = play(setup(hands), "9♠");
    expect(() => play(s, "8♥")).toThrow();
    expect(() => play(s, "3♠")).toThrow();
    expect(explainIllegalPlay(viewFor(s, 1), cs("8♥"))).toMatch(/higher single/);
    expect(explainIllegalPlay(viewFor(s, 1), cs("6♠ 8♥"))).toMatch(/Not a valid/);
    expect(explainIllegalPlay(viewFor(s, 0), cs("5♠"))).toMatch(/turn/);
  });

  it("passing locks a player out; the last player to play wins the round and leads", () => {
    let s = setup(hands);
    s = play(s, "5♠"); // seat 0
    s = play(s, "6♠"); // seat 1
    s = play(s, "7♠"); // seat 2
    s = pass(s); // seat 3
    expect(s.turn).toBe(0);
    s = pass(s); // seat 0 passes, locked out
    expect(s.turn).toBe(1);
    s = pass(s); // seat 1 passes
    expect(s.table).toBeNull();
    expect(s.turn).toBe(2);
    expect(s.passed).toEqual([false, false, false, false]);
    expect(s.hands[2]).toEqual(cs("10♥"));
  });

  it("skips players who already passed", () => {
    let s = setup(["5♠ 9♠ A♠", "6♠", "7♠ K♠", "8♠ J♥"]);
    s = play(s, "5♠");
    s = pass(s); // seat 1
    s = play(s, "7♠"); // seat 2
    s = play(s, "8♠"); // seat 3
    expect(s.turn).toBe(0);
    s = play(s, "9♠"); // seat 0
    expect(s.turn).toBe(2); // seat 1 passed earlier and is skipped
  });

  it("emptying the hand wins immediately", () => {
    let s = setup(["5♠", "6♠ 8♥", "7♠ 10♥", "8♠ J♥"]);
    s = play(s, "5♠");
    expect(s.winner).toBe(0);
    expect(legalMoves(s)).toEqual([]);
    expect(() => pass(s)).toThrow();
  });

  it("a bomb chops a 2 and takes the table", () => {
    let s = setup(["2♥ 9♠", "7♠ 7♣ 7♦ 7♥ 3♠", "4♠", "5♠"]);
    s = play(s, "2♥");
    expect(legalMoves(s).filter((m) => m.type === "play")).toHaveLength(1);
    s = play(s, "7♠ 7♣ 7♦ 7♥");
    expect(s.table?.seat).toBe(1);
  });
});

describe("privacy", () => {
  it("a view hides other hands until the game is over", () => {
    const s = newGame({ seed: 11, leader: 0 });
    const view = viewFor(s, 1);
    expect(view.hand).toEqual(s.hands[1]);
    expect(view.revealed).toBeNull();
    expect(view.handSizes).toEqual([13, 13, 13, 13]);
    expect(Object.keys(view)).not.toContain("hands");
    const done = setup(["5♠", "6♠", "7♠", "8♠"]);
    expect(viewFor(play(done, "5♠"), 1).revealed).toEqual([[], cs("6♠"), cs("7♠"), cs("8♠")]);
  });
});
