import { describe, expect, it } from "vitest";
import { type Bot, heuristicBot, playOut, randomBot } from "../src/bots";
import { type GameState, type RuleOptions, makeRng, newGame, viewFor } from "../src/engine";

/** Wraps a bot to assert that it never sees anything beyond its own seat during play. */
function spy(bot: Bot, state: { current: GameState }): Bot {
  return {
    name: bot.name,
    choose(view, legal, rng) {
      const truth = state.current;
      expect(view.revealed).toBeNull();
      expect(view.hand).toEqual(truth.hands[view.seat]);
      expect(view).toEqual(viewFor(truth, view.seat));
      return bot.choose(view, legal, rng);
    },
  };
}

function checkedGame(seed: number, bots: Bot[], leader?: number, rules?: RuleOptions) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const start = newGame({ seed, leader, rules });
  const current = { current: start };
  const spies = bots.map((b) => spy(b, current));
  const final = playOut(start, spies, rng, (state) => {
    current.current = state;
    const inHands = state.hands.flat();
    const played = state.history.flatMap((h) => h.combo?.cards ?? []);
    expect(inHands.length + played.length).toBe(52);
    expect(new Set([...inHands, ...played]).size).toBe(52);
  });
  return final;
}

describe("seeded bot games", () => {
  it("heuristic bots play legal, terminating, card-conserving games", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const final = checkedGame(seed, Array(4).fill(heuristicBot), seed % 2 ? undefined : seed % 4);
      expect(final.winner).not.toBeNull();
      if (!final.instantWin) expect(final.hands[final.winner!]).toEqual([]);
    }
  });

  it("random bots play legal, terminating, card-conserving games", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const final = checkedGame(seed, Array(4).fill(randomBot));
      expect(final.winner).not.toBeNull();
    }
  });

  it("plays legal, terminating, card-conserving games when bombs beat anything", () => {
    const rules = { bombsBeatAnything: true };
    for (const bot of [heuristicBot, randomBot]) {
      for (let seed = 1; seed <= 80; seed++) {
        const final = checkedGame(seed, Array(4).fill(bot), seed % 2 ? undefined : seed % 4, rules);
        expect(final.winner).not.toBeNull();
        expect(final.rules).toEqual(rules);
      }
    }
  });

  it("is reproducible from the seed", () => {
    const run = () => checkedGame(99, Array(4).fill(heuristicBot), 0).history;
    expect(run()).toEqual(run());
  });

  it("heuristic bot clearly beats random bots", () => {
    let wins = 0;
    const games = 200;
    for (let seed = 1; seed <= games; seed++) {
      const bots = [heuristicBot, randomBot, randomBot, randomBot];
      const final = playOut(newGame({ seed, leader: 0 }), bots, makeRng(seed));
      if (final.winner === 0) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.4);
  });
});
