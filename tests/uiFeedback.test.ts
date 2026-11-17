import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type PlayerView, newGame, viewFor } from "../src/engine";
import { Entry, Felt, Opponent } from "../src/ui/Board";
import { GameScreen, nextHandSort } from "../src/ui/GameScreen";
import { LOCAL_PLAYERS, PlayersContext } from "../src/ui/players";
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

describe("game text", () => {
  const players = { ...LOCAL_PLAYERS, names: ["You", "James", "Bot Two", "Bot Three"] };

  function renderScreen(current: PlayerView, phase: "intro" | "ready" = "ready") {
    return renderToStaticMarkup(createElement(
      PlayersContext.Provider,
      { value: players },
      createElement(GameScreen, {
        view: current, turnShown: true, settings: DEFAULT_SETTINGS,
        onSettings: () => {}, record: "", opening: { phase, dealt: 52 }, reducedMotion: true,
        dealCode: null, onMove: () => {}, onOpenMenu: () => {}, onOpenRules: () => {}, gameOverActions: null,
      }),
    ));
  }

  it("omits played from card history but retains suits and pass messages", () => {
    const play = renderToStaticMarkup(createElement(Entry, { entry: { seat: 1, combo: combo("3♠ 3♣") } }));
    const pass = renderToStaticMarkup(createElement(Entry, { entry: { seat: 1, combo: null } }));
    expect(play).toContain("3♠ 3♣");
    expect(play).not.toContain("played");
    expect(pass).toContain("passed");
  });

  it("shows only the combination label above the table cards", () => {
    const markup = renderToStaticMarkup(createElement(Felt, { view: view(), showLog: false }));
    expect(markup).toContain('<div class="played-label">single</div>');
    expect(markup).not.toContain("Bot Two");
  });

  it("styles human and bot names in opening, playing, and beat messages", () => {
    const current = view();
    expect(renderScreen({ ...current, turn: 1 }, "intro"))
      .toContain('<span class="status-name">James</span> starts!');
    expect(renderScreen({ ...current, turn: 2 }))
      .toContain('<span class="status-name">Bot Two</span> is playing…');
    expect(renderScreen({ ...current, table: { seat: 1, combo: combo("3♠") } }))
      .toContain('<span class="status-name">James</span>&#x27;s');
    expect(renderScreen({ ...current, table: { seat: 2, combo: combo("3♠") } }))
      .toContain('<span class="status-name">Bot Two</span>&#x27;s');
  });

  it("does not style the player's own messages as opponent names", () => {
    const current = view();
    const ownTable = renderScreen({ ...current, table: { seat: 0, combo: combo("3♠") } });
    expect(ownTable).toContain("Beat your single.");
    expect(ownTable).not.toContain('class="status-name"');
    const instant = renderScreen({ ...current, turn: 1, instantWin: "fourTwos" }, "intro");
    expect(instant).toContain("Instant win!");
    expect(instant).not.toContain('class="status-name"');
  });
});
