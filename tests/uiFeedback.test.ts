import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type PlayerView, newGame, viewFor } from "../src/engine";
import { Opponent } from "../src/ui/Board";
import { GameScreen, nextHandSort } from "../src/ui/GameScreen";
import { DEFAULT_SETTINGS } from "../src/ui/settings";
import { combo, cs } from "./helpers";

function view(): PlayerView {
  return {
    ...viewFor(newGame({ seed: 1, leader: 0 }), 0),
    hand: cs("3♠ 3♣ 4♠"),
    handSizes: [3, 1, 2, 2],
    winner: null,
    instantWin: null,
    turn: 0,
    table: { seat: 2, combo: combo("4♣") },
    history: [{ seat: 1, combo: combo("3♣") }, { seat: 2, combo: combo("4♣") }],
  };
}

describe("game screen cards", () => {
  it("cycles through the hand sort orders and back to the start", () => {
    const descending = nextHandSort("rank-asc");
    const suit = nextHandSort(descending);
    expect(descending).toBe("rank-desc");
    expect(suit).toBe("suit");
    expect(nextHandSort(suit)).toBe("rank-asc");
  });

  it("shows the hand count and chosen sort order", () => {
    const markup = renderToStaticMarkup(createElement(GameScreen, {
      view: view(), turnShown: true, settings: { ...DEFAULT_SETTINGS, handSort: "rank-desc" },
      onSettings: () => {}, record: "", opening: { phase: "ready", dealt: 52 }, reducedMotion: true,
      dealCode: null, onMove: () => {}, onOpenMenu: () => {}, onOpenRules: () => {}, gameOverActions: null,
    }));
    expect(markup).toContain(">3 cards</span>");
    expect(markup).toContain('aria-label="Sort hand: rank descending. Next: suit."');
    expect(markup.indexOf('aria-label="Sort hand:')).toBeLessThan(markup.indexOf('data-testid="status"'));
    expect(markup.indexOf('data-testid="hand"')).toBeLessThan(markup.indexOf(">3 cards</span>"));
    expect(markup.indexOf('aria-label="4 of spades"')).toBeLessThan(markup.indexOf('aria-label="3 of clubs"'));
  });

  it("shows an opponent's played status until the table clears", () => {
    const current = view();
    const renderOpponent = (v: PlayerView) => renderToStaticMarkup(createElement(Opponent, { seat: 1, view: v, turnShown: true }));
    expect(renderOpponent(current)).toContain('aria-label="1 card left"');
    expect(renderOpponent(current)).toContain(">Played</div>");
    expect(renderOpponent({
      ...current,
      history: [...current.history, { seat: 3, combo: null }, { seat: 0, combo: null }, { seat: 1, combo: null }, { seat: 2, combo: combo("5♠") }],
    })).toContain(">Waiting</div>");
  });
});
