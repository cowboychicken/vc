import { describe, expect, it } from "vitest";
import { applyMove, legalMoves } from "../src/engine";
import { HUMAN, initSession, reduceSession, type Session } from "../src/ui/session";

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
    const s = initSession(5);
    expect(s.game.turn).not.toBe(HUMAN);
    const next = reduceSession(s, { type: "bot" });
    expect(next.game.history).toHaveLength(1);
  });

  it("ignores bot actions on the human's turn and human actions out of turn", () => {
    const s = initSession(5);
    const botTurn = s.game.turn;
    expect(reduceSession(s, { type: "human", move: { type: "pass" } })).toBe(s);
    const humanTurn = { ...s, game: { ...s.game, turn: HUMAN } };
    expect(reduceSession(humanTurn, { type: "bot" })).toBe(humanTurn);
    expect(botTurn).not.toBe(HUMAN);
  });

  it("ignores illegal human moves", () => {
    const s = initSession(5);
    const mine = { ...s, game: { ...s.game, turn: HUMAN, openingRequired: false } };
    expect(reduceSession(mine, { type: "human", move: { type: "pass" } })).toBe(mine);
    expect(() => applyMove(mine.game, { type: "pass" })).toThrow();
  });

  it("plays full games, counts results, and lets the winner lead a rematch", () => {
    let s = playToEnd(initSession(5));
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
    const first = initSession(5);
    const done = playToEnd(first);
    const again = reduceSession(done, { type: "sameDeal" });
    expect(again.game.hands).toEqual(first.game.hands);
    expect(again.game.turn).toBe(first.game.turn);
    expect(again.game.openingRequired).toBe(first.game.openingRequired);
  });
});
