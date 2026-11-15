import { describe, expect, it } from "vitest";
import { newGame, viewFor } from "../src/engine";
import { DEAL_CARD_MS, INTRO_MS, dealProgress, dealtCounts, openingMessage } from "../src/ui/dealPresentation";

describe("deal presentation", () => {
  it("deals clockwise from the viewer's seat, one card at a time", () => {
    expect(dealtCounts(0, 2)).toEqual([0, 0, 0, 0]);
    expect(dealtCounts(1, 2)).toEqual([0, 0, 1, 0]);
    expect(dealtCounts(3, 2)).toEqual([1, 0, 1, 1]);
    expect(dealtCounts(52, 2)).toEqual([13, 13, 13, 13]);
  });

  it("gives the opening player useful instructions", () => {
    const game = newGame({ seed: 5 });
    const opener = viewFor(game, game.turn);
    expect(openingMessage(opener, "You")).toContain("3♠");
    const observer = viewFor(game, (game.turn + 1) % 4);
    expect(openingMessage(observer, "Bot One")).toBe("Bot One starts!");
    expect(openingMessage({ ...opener, instantWin: "fourTwos" }, "You")).toBe("Instant win!");
  });

  it("uses elapsed time to advance the deal and honors reduced motion", () => {
    expect(dealProgress(DEAL_CARD_MS * 10, false)).toEqual({ phase: "dealing", dealt: 10 });
    expect(dealProgress(DEAL_CARD_MS * 52, false)).toEqual({ phase: "intro", dealt: 52 });
    expect(dealProgress(DEAL_CARD_MS * 52 + INTRO_MS, false)).toEqual({ phase: "ready", dealt: 52 });
    expect(dealProgress(0, true)).toEqual({ phase: "intro", dealt: 52 });
    expect(dealProgress(INTRO_MS, true)).toEqual({ phase: "ready", dealt: 52 });
  });
});
