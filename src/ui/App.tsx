import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { heuristicBot } from "../bots";
import {
  type Card,
  type NewGameOptions,
  NUM_PLAYERS,
  canPass,
  describeCombo,
  explainIllegalPlay,
  legalMovesForView,
  legalPlaysForView,
  classify,
  makeRng,
  viewFor,
  cardLabel,
  THREE_OF_SPADES,
} from "../engine";
import { CardFace } from "./CardFace";
import { Felt, GameOver, Opponent, possessive } from "./Board";
import { MenuDialog } from "./Menu";
import { HUMAN, SEAT_NAMES, initSession, reduceSession } from "./session";
import { BOT_BY_LEVEL, BOT_DELAY_MS, type Settings, loadSettings, saveSettings } from "./settings";

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

function parseUint(text: string | null): number | null {
  if (text === null || !/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n >>> 0 : null;
}

/** `?seed=N` replays a deal; `&leader=0..3` restores who led it. */
function startingOptions(): NewGameOptions {
  const params = new URLSearchParams(window.location.search);
  const seed = parseUint(params.get("seed"));
  if (seed === null) return { seed: randomSeed() };
  const leader = parseUint(params.get("leader"));
  return leader !== null && leader < NUM_PLAYERS ? { seed, leader } : { seed };
}

export default function App() {
  const [session, dispatch] = useReducer(reduceSession, undefined, () => initSession(startingOptions()));
  const [selected, setSelected] = useState<Card[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const { game } = session;
  const view = useMemo(() => viewFor(game, HUMAN), [game]);
  const myTurn = view.turn === HUMAN && view.winner === null;

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  // Bots wait while the menu is open.
  useEffect(() => {
    if (menuOpen || game.winner !== null || game.turn === HUMAN) return;
    const id = window.setTimeout(
      () => dispatch({ type: "bot", bot: BOT_BY_LEVEL[settings.botLevel] }),
      BOT_DELAY_MS[settings.botSpeed],
    );
    return () => window.clearTimeout(id);
  }, [game, menuOpen, settings.botLevel, settings.botSpeed]);

  const toggle = useCallback(
    (card: Card) => {
      if (!myTurn) return;
      setHint(null);
      setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
    },
    [myTurn],
  );

  const reason = selected.length > 0 ? explainIllegalPlay(view, selected) : null;
  const canPlay = myTurn && selected.length > 0 && reason === null;
  const legalCount = useMemo(() => (myTurn ? legalPlaysForView(view).length : 0), [myTurn, view]);

  const doPlay = () => {
    if (!canPlay) return;
    dispatch({ type: "human", move: { type: "play", cards: selected } });
    setSelected([]);
    setHint(null);
  };
  const doPass = () => {
    dispatch({ type: "human", move: { type: "pass" } });
    setSelected([]);
    setHint(null);
  };
  const doHint = () => {
    const move = heuristicBot.choose(view, legalMovesForView(view), makeRng(game.history.length));
    if (move.type === "play") {
      setSelected(move.cards);
      setHint(null);
    } else {
      setSelected([]);
      setHint("Hint: pass this one.");
    }
  };
  const resetFor = (action: Parameters<typeof dispatch>[0]) => {
    setSelected([]);
    setHint(null);
    dispatch(action);
  };

  let status: string;
  let tone: "info" | "warn" | "ok" = "info";
  if (view.winner !== null) status = "Game over.";
  else if (!myTurn) status = `${SEAT_NAMES[view.turn]} is playing…`;
  else if (selected.length > 0 && reason) {
    status = reason;
    tone = "warn";
  } else if (selected.length > 0) {
    status = `Ready to play ${describeCombo(classify(selected)!)}.`;
    tone = "ok";
  } else if (hint) status = hint;
  else if (view.table) {
    status =
      legalCount === 0
        ? "Nothing in your hand beats that. Pass."
        : `Beat ${possessive(view.table.seat)} ${describeCombo(view.table.combo)}.`;
  } else if (view.openingRequired) status = `You hold ${cardLabel(THREE_OF_SPADES)}. Lead with it.`;
  else status = "Your lead. Play any combination.";

  return (
    <div className="app">
      <header className="topbar">
        <h1>VC_13</h1>
        <div className="meta">
          <span data-testid="record">
            Won {session.won} of {session.played}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Menu, rules and settings"
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            i
          </button>
        </div>
      </header>

      <main className="board">
        <Opponent seat={2} view={view} />
        <Opponent seat={1} view={view} />
        <Felt view={view} showLog={settings.moveLog} />
        <Opponent seat={3} view={view} />
      </main>

      <section className={`player${myTurn ? " active" : ""}`} aria-label="Your hand">
        <p className={`status ${tone}`} role="status" data-testid="status">
          {status}
        </p>
        <div className="hand" data-testid="hand">
          {view.hand.map((c) => (
            <CardFace key={c} card={c} selected={selected.includes(c)} onToggle={toggle} />
          ))}
        </div>
        <div className="actions">
          <button type="button" onClick={doPass} disabled={!canPass(view)}>
            Pass
          </button>
          {settings.hints && (
            <button type="button" onClick={doHint} disabled={!myTurn}>
              Hint
            </button>
          )}
          <button type="button" onClick={() => setSelected([])} disabled={selected.length === 0}>
            Clear
          </button>
          <button type="button" className="primary" onClick={doPlay} disabled={!canPlay}>
            Play
          </button>
        </div>
      </section>

      {view.winner !== null && (
        <GameOver
          view={view}
          onRematch={() => resetFor({ type: "rematch", seed: randomSeed() })}
          onSameDeal={() => resetFor({ type: "sameDeal" })}
        />
      )}

      {menuOpen && (
        <MenuDialog
          game={game}
          start={session.start}
          settings={settings}
          onSettings={updateSettings}
          onNewDeal={() => {
            resetFor(
              game.winner !== null ? { type: "rematch", seed: randomSeed() } : { type: "restart", seed: randomSeed() },
            );
            setMenuOpen(false);
          }}
          onSameDeal={() => {
            resetFor({ type: "sameDeal" });
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
