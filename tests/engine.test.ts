import { describe, expect, it } from "vitest";
import { allCombos, beats, classify, instantWin, legalPlays } from "../src/engine";
import { c, combo, cs } from "./helpers";

describe("classify", () => {
  it.each([
    ["8♣", "single"],
    ["8♣ 8♥", "pair"],
    ["9♠ 9♦ 9♥", "triple"],
    ["9♠ 9♣ 9♦ 9♥", "quad"],
    ["4♠ 5♥ 6♣", "run"],
    ["10♠ J♥ Q♣ K♦ A♠", "run"],
    ["3♠ 3♥ 4♣ 4♦ 5♥ 5♠", "pairRun"],
    ["2♠ 2♥", "pair"],
  ])("%s is a %s", (labels, kind) => {
    expect(classify(cs(labels))?.kind).toBe(kind);
  });

  it.each([
    ["empty", ""],
    ["two different ranks", "3♠ 4♠"],
    ["run with a 2", "K♠ A♠ 2♠"],
    ["wrap-around", "Q♠ K♠ A♠ 2♠ 3♠"],
    ["gap in run", "5♠ 6♠ 8♠"],
    ["pair run containing 2s", "K♠ K♥ A♠ A♥ 2♠ 2♥"],
    ["pair plus single", "5♠ 5♥ 6♠"],
    ["only two pairs", "5♠ 5♥ 6♠ 6♥"],
    ["duplicate card", "5♠ 5♠"],
  ])("rejects %s", (_name, labels) => {
    expect(classify(cs(labels))).toBeNull();
  });

  it("sorts cards and records the top card", () => {
    const run = combo("6♣ 4♠ 5♥");
    expect(run.cards).toEqual(cs("4♠ 5♥ 6♣"));
    expect(run.top).toBe(c("6♣"));
  });
});

describe("beats", () => {
  it("needs a higher top card of the same kind and size", () => {
    expect(beats(combo("5♦"), combo("6♠"))).toBe(true);
    expect(beats(combo("6♠"), combo("5♥"))).toBe(false);
    expect(beats(combo("4♠ 5♠ 6♠"), combo("5♥ 6♥ 7♥"))).toBe(true);
    expect(beats(combo("4♠ 5♠ 6♠"), combo("4♠ 5♠ 6♠ 7♠"))).toBe(false);
    expect(beats(combo("5♠ 5♥"), combo("6♠ 6♣"))).toBe(true);
  });

  it("breaks ties by suit", () => {
    expect(beats(combo("5♦ 5♣"), combo("5♥ 5♠"))).toBe(true);
    expect(beats(combo("5♥"), combo("5♦"))).toBe(false);
    expect(beats(combo("5♠"), combo("5♣"))).toBe(true);
    expect(beats(combo("5♣"), combo("5♠"))).toBe(false);
  });

  it("ranks 2 above ace", () => {
    expect(beats(combo("A♥"), combo("2♠"))).toBe(true);
    expect(beats(combo("2♠"), combo("A♥"))).toBe(false);
  });

  it("does not allow different kinds", () => {
    expect(beats(combo("5♠"), combo("6♠ 6♥"))).toBe(false);
    expect(beats(combo("5♠ 5♥"), combo("6♠ 6♥ 6♣"))).toBe(false);
  });

  describe("chops", () => {
    const threePairs = "3♠ 3♥ 4♣ 4♦ 5♥ 5♠";
    const quad = "7♠ 7♣ 7♦ 7♥";
    const fourPairs = "3♠ 3♥ 4♣ 4♦ 5♥ 5♠ 6♠ 6♥";
    const fivePairs = "3♠ 3♥ 4♣ 4♦ 5♥ 5♠ 6♠ 6♥ 7♠ 7♥";

    it("a single 2 falls to any bomb", () => {
      for (const bomb of [threePairs, quad, fourPairs]) expect(beats(combo("2♥"), combo(bomb))).toBe(true);
    });
    it("a pair of 2s falls to four of a kind or a 4-pair run, not a 3-pair run", () => {
      expect(beats(combo("2♠ 2♥"), combo(quad))).toBe(true);
      expect(beats(combo("2♠ 2♥"), combo(fourPairs))).toBe(true);
      expect(beats(combo("2♠ 2♥"), combo(threePairs))).toBe(false);
    });
    it("a triple of 2s falls only to a 4-pair run or better", () => {
      expect(beats(combo("2♠ 2♣ 2♥"), combo(fourPairs))).toBe(true);
      expect(beats(combo("2♠ 2♣ 2♥"), combo(quad))).toBe(false);
      expect(beats(combo("2♠ 2♣ 2♥"), combo(threePairs))).toBe(false);
    });
    it("orders bombs: 3-pair run < four of a kind < 4-pair run < 5-pair run", () => {
      const order = [threePairs, quad, fourPairs, fivePairs];
      for (let i = 0; i < order.length; i++)
        for (let j = 0; j < order.length; j++)
          expect(beats(combo(order[i]!), combo(order[j]!))).toBe(j > i);
    });
    it("compares bombs of the same kind by top card", () => {
      expect(beats(combo("7♠ 7♣ 7♦ 7♥"), combo("8♠ 8♣ 8♦ 8♥"))).toBe(true);
      expect(beats(combo("8♠ 8♣ 8♦ 8♥"), combo("7♠ 7♣ 7♦ 7♥"))).toBe(false);
    });
    it("a quad of 2s can only be beaten by a longer pair run", () => {
      expect(beats(combo("2♠ 2♣ 2♦ 2♥"), combo(fourPairs))).toBe(true);
      expect(beats(combo("2♠ 2♣ 2♦ 2♥"), combo(threePairs))).toBe(false);
    });
    it("bombs cannot be played on ordinary cards of another kind", () => {
      expect(beats(combo("A♥"), combo(quad))).toBe(false);
      expect(beats(combo("A♥ A♠"), combo(fourPairs))).toBe(false);
      expect(beats(combo("5♠ 6♠ 7♠"), combo(quad))).toBe(false);
    });
    it("ordinary plays cannot chop a 2", () => {
      expect(beats(combo("2♠"), combo("A♥"))).toBe(false);
      expect(beats(combo("2♠ 2♥"), combo("A♠ A♥"))).toBe(false);
    });
  });
});

describe("instantWin", () => {
  it("detects four 2s", () => {
    expect(instantWin(cs("2♠ 2♣ 2♦ 2♥ 3♠ 5♠ 7♠ 9♠ J♠ K♠ 4♣ 6♣ 8♣"))).toBe("fourTwos");
  });
  it("detects a dragon", () => {
    expect(instantWin(cs("3♠ 4♠ 5♠ 6♠ 7♠ 8♠ 9♠ 10♠ J♠ Q♠ K♠ A♠ 3♥"))).toBe("dragon");
  });
  it("detects six pairs, counting a quad as two", () => {
    expect(instantWin(cs("3♠ 3♥ 4♠ 4♥ 5♠ 5♥ 6♠ 6♥ 7♠ 7♥ 9♠ 9♥ K♠"))).toBe("sixPairs");
    expect(instantWin(cs("3♠ 3♥ 3♦ 3♣ 5♠ 5♥ 6♠ 6♥ 7♠ 7♥ 9♠ 9♥ K♠"))).toBe("sixPairs");
  });
  it("does not trigger on five pairs or a 2-less near dragon", () => {
    expect(instantWin(cs("3♠ 3♥ 4♠ 4♥ 5♠ 5♥ 6♠ 6♥ 7♠ 7♥ 9♠ J♥ K♠"))).toBeNull();
    expect(instantWin(cs("3♠ 4♠ 5♠ 6♠ 7♠ 8♠ 9♠ 10♠ J♠ Q♠ K♠ 2♠ 3♥"))).toBeNull();
  });
});

describe("legalPlays", () => {
  it("generates every run and pair run from a hand", () => {
    const hand = cs("3♠ 4♥ 5♣ 6♦");
    const runs = allCombos(hand).filter((x) => x.kind === "run");
    expect(runs.map((r) => r.cards.length).sort()).toEqual([3, 3, 4]);
  });

  it("generates one run per suit choice", () => {
    const hand = cs("3♠ 3♥ 4♣ 5♦");
    const runs = allCombos(hand).filter((x) => x.kind === "run");
    expect(runs).toHaveLength(2);
  });

  it("generates pair runs and quads", () => {
    const hand = cs("3♠ 3♥ 4♣ 4♦ 5♥ 5♠ 9♠ 9♣ 9♦ 9♥");
    const kinds = allCombos(hand).map((x) => x.kind);
    expect(kinds.filter((k) => k === "pairRun")).toHaveLength(1);
    expect(kinds.filter((k) => k === "quad")).toHaveLength(1);
    expect(kinds.filter((k) => k === "triple")).toHaveLength(4);
  });

  it("every generated combination classifies as itself", () => {
    const hand = cs("3♠ 3♥ 4♣ 4♦ 5♥ 5♠ 6♠ 6♥ 7♦ 9♠ 9♣ 2♦ 2♥");
    for (const x of allCombos(hand)) expect(classify(x.cards)).toEqual(x);
  });

  it("never builds runs through the 2", () => {
    const hand = cs("Q♠ K♠ A♠ 2♠ 3♠");
    expect(allCombos(hand).filter((x) => x.kind === "run").map((x) => x.cards.length)).toEqual([3]);
  });

  it("restricts the first lead to plays containing 3♠", () => {
    const hand = cs("3♠ 3♥ 4♣ 9♦");
    const plays = legalPlays(hand, null, true);
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((p) => p.cards.includes(c("3♠")))).toBe(true);
    expect(legalPlays(hand, null, false).length).toBeGreaterThan(plays.length);
  });

  it("only offers plays that beat the table", () => {
    const hand = cs("3♠ 7♥ 7♣ 9♦ 2♥ 4♠ 4♥ 4♦ 4♣");
    const table = combo("2♠");
    const plays = legalPlays(hand, table, false);
    expect(plays.map((p) => p.kind).sort()).toEqual(["quad", "single"]);
  });
});
