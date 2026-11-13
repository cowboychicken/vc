import { describe, expect, it } from "vitest";
import { heuristicBot, randomBot } from "../src/bots";
import { applyMove, legalMoves } from "../src/engine";
import { HUMAN, initSession, reduceSession, type Session } from "../src/ui/session";
import { DEFAULT_SETTINGS, parseSettings } from "../src/ui/settings";

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

describe("settings", () => {
  it("falls back to defaults for missing or invalid stored values", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ botSpeed: "warp", botLevel: 3, hints: "yes" }))).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid stored values", () => {
    const stored = { botSpeed: "fast", botLevel: "easy", hints: false, moveLog: false, bombsBeatAnything: true };
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored);
  });
});
