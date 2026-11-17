import { describe, expect, it } from "vitest";
import { heuristicBot, randomBot } from "../src/bots";
import { applyMove, decodeDeal, encodeDeal, legalMoves } from "../src/engine";
import { HUMAN, initSession, isTurnShown, reduceSession, type Session } from "../src/ui/session";
import { DEFAULT_SETTINGS, parseSettings, sortHand } from "../src/ui/settings";
import { cs } from "./helpers";

/** Drives a session to the end: bots via the reducer, the human by taking its first legal move. */
function playToEnd(start: Session): Session {
  let s = start;
  for (let i = 0; s.game.winner === null; i++) {
    if (i > 500) throw new Error("did not finish");
    s =
      s.game.turn === HUMAN
        ? reduceSession(s, { type: "human", move: legalMoves(s.game)[0]! })
        : reduceSession(s, { type: "bot" });
  }
  return s;
}

describe("session reducer", () => {
  it("bots move when it is their turn", () => {
    const s = initSession({ seed: 5 });
    expect(s.game.turn).not.toBe(HUMAN);
    const next = reduceSession(s, { type: "bot" });
    expect(next.game.history).toHaveLength(1);
  });

  it("uses the bot it is given and always makes a legal move", () => {
    for (const bot of [randomBot, heuristicBot]) {
      let s = initSession({ seed: 9, leader: 1 });
      for (let i = 0; i < 3; i++) s = reduceSession(s, { type: "bot", bot });
      expect(s.game.history.length).toBeGreaterThan(0);
    }
  });

  it("ignores bot actions on the human's turn and human actions out of turn", () => {
    const s = initSession({ seed: 5 });
    const botTurn = s.game.turn;
    expect(reduceSession(s, { type: "human", move: { type: "pass" } })).toBe(s);
    const humanTurn = { ...s, game: { ...s.game, turn: HUMAN } };
    expect(reduceSession(humanTurn, { type: "bot" })).toBe(humanTurn);
    expect(botTurn).not.toBe(HUMAN);
  });

  it("ignores illegal human moves", () => {
    const s = initSession({ seed: 5 });
    const mine = { ...s, game: { ...s.game, turn: HUMAN, openingRequired: false } };
    expect(reduceSession(mine, { type: "human", move: { type: "pass" } })).toBe(mine);
    expect(() => applyMove(mine.game, { type: "pass" })).toThrow();
  });

  it("plays full games, counts results, and lets the winner lead a rematch", () => {
    let s = playToEnd(initSession({ seed: 5 }));
    expect(s.played).toBe(1);
    const winner = s.game.winner!;
    expect(s.won).toBe(winner === HUMAN ? 1 : 0);

    s = reduceSession(s, { type: "rematch", seed: 6 });
    expect(s.game.winner === null || s.played === 2).toBe(true);
    if (s.game.winner === null) expect(s.game.turn).toBe(winner);

    s = playToEnd(s);
    expect(s.played).toBe(2);
  });

  it("replaying the same deal restores the same hands and opening rule", () => {
    const first = initSession({ seed: 5 });
    const done = playToEnd(first);
    const again = reduceSession(done, { type: "sameDeal" });
    expect(again.game.hands).toEqual(first.game.hands);
    expect(again.game.turn).toBe(first.game.turn);
    expect(again.game.openingRequired).toBe(first.game.openingRequired);
    expect(again.dealNumber).toBe(first.dealNumber + 1);
  });

  it("restarting mid-game abandons it without counting a result", () => {
    let s = initSession({ seed: 5 });
    s = reduceSession(s, { type: "bot" });
    s = reduceSession(s, { type: "restart", seed: 12 });
    expect(s.game.seed).toBe(12);
    expect(s.game.history).toHaveLength(0);
    expect(s.played).toBe(s.game.winner === null ? 0 : 1);
  });

  it("applies a rule change to the current game and to every later deal and replay", () => {
    const on = { bombsBeatAnything: true };
    let s = reduceSession(initSession({ seed: 5 }), { type: "rules", rules: on });
    expect(s.game.rules).toEqual(on);
    expect(reduceSession(s, { type: "rules", rules: on })).toBe(s);
    expect(reduceSession(s, { type: "sameDeal" }).game.rules).toEqual(on);
    expect(reduceSession(s, { type: "restart", seed: 8 }).game.rules).toEqual(on);
    s = playToEnd(s);
    expect(reduceSession(s, { type: "rematch", seed: 9 }).game.rules).toEqual(on);
    const off = { bombsBeatAnything: false };
    expect(reduceSession(s, { type: "rules", rules: off }).game.rules).toEqual(off);
  });

  it("restores a shared deal including who led it", () => {
    const s = initSession({ seed: 5, leader: 2 });
    expect(s.game.turn).toBe(2);
    expect(reduceSession(s, { type: "sameDeal" }).game.turn).toBe(2);
  });
});

describe("deal codes in a session", () => {
  it("loads a code into a fresh game with the same hands, leader and rules", () => {
    const shared = initSession({ seed: 777, leader: 3, rules: { bombsBeatAnything: true } });
    const code = encodeDeal(shared.start);
    const mine = reduceSession(initSession({ seed: 1, rules: { bombsBeatAnything: false } }), {
      type: "load",
      deal: decodeDeal(code)!,
    });
    expect(mine.game.hands).toEqual(shared.game.hands);
    expect(mine.game.turn).toBe(3);
    expect(mine.game.rules).toEqual({ bombsBeatAnything: false }); // rules stay the player's own setting
    expect(encodeDeal(mine.start)).toBe(code);
  });

  it("gives a first-game code that restores the 3♠ opening", () => {
    const first = initSession({ seed: 41 });
    const loaded = reduceSession(initSession({ seed: 2 }), { type: "load", deal: decodeDeal(encodeDeal(first.start))! });
    expect(loaded.game.hands).toEqual(first.game.hands);
    expect(loaded.game.openingRequired).toBe(first.game.openingRequired);
    expect(loaded.game.turn).toBe(first.game.turn);
  });

  it("restarting a loaded deal keeps its code", () => {
    let s = reduceSession(initSession({ seed: 1 }), { type: "load", deal: { seed: 99, leader: 2 } });
    s = reduceSession(s, { type: "bot" });
    s = reduceSession(s, { type: "sameDeal" });
    expect(encodeDeal(s.start)).toBe(encodeDeal({ seed: 99, leader: 2 }));
    expect(s.game.history).toHaveLength(0);
  });
});

describe("turn pacing", () => {
  it("shows the first turn, the human's turn and a finished game straight away", () => {
    const start = initSession({ seed: 5, leader: 1 });
    expect(isTurnShown(start.game, null)).toBe(true);
    const afterBot = reduceSession(start, { type: "bot" });
    const humanTurn = { ...afterBot.game, turn: HUMAN };
    expect(isTurnShown(humanTurn, null)).toBe(true);
    const over = { ...afterBot.game, winner: 2 };
    expect(isTurnShown(over, null)).toBe(true);
  });

  it("holds back a bot's turn after a move until that exact state is revealed", () => {
    const afterBot = reduceSession(initSession({ seed: 5, leader: 1 }), { type: "bot" });
    expect(afterBot.game.turn).not.toBe(HUMAN);
    expect(isTurnShown(afterBot.game, null)).toBe(false);
    expect(isTurnShown(afterBot.game, afterBot.game)).toBe(true);
    const next = reduceSession(afterBot, { type: "bot" });
    if (next.game.turn !== HUMAN) expect(isTurnShown(next.game, afterBot.game)).toBe(false);
  });
});

describe("settings", () => {
  it("falls back to defaults for missing or invalid stored values", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ botSpeed: "warp", botLevel: 3, hints: "yes", darkMode: 1 }))).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid stored values", () => {
    const stored = { botSpeed: "fast", botLevel: "easy", hints: false, handSort: "suit", moveLog: false, darkMode: true, bombsBeatAnything: true };
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });

  it("defaults the hand sort for older or invalid saved settings", () => {
    expect(parseSettings(JSON.stringify({ hints: false })).handSort).toBe("rank-asc");
    expect(parseSettings(JSON.stringify({ handSort: "invalid" })).handSort).toBe("rank-asc");
  });

  it("sorts by game rank in either direction or groups suits without changing the hand", () => {
    const hand = cs("4♣ 2♥ 3♣ 4♠ 3♠");
    expect(sortHand(hand, "rank-asc")).toEqual(cs("3♠ 3♣ 4♠ 4♣ 2♥"));
    expect(sortHand(hand, "rank-desc")).toEqual(cs("2♥ 4♣ 4♠ 3♣ 3♠"));
    expect(sortHand(hand, "suit")).toEqual(cs("3♠ 4♠ 3♣ 4♣ 2♥"));
    expect(hand).toEqual(cs("4♣ 2♥ 3♣ 4♠ 3♠"));
  });
});
