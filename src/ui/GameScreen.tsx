import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { heuristicBot } from "../bots";
import {
  type Card,
  type Move,
  type PlayerView,
  THREE_OF_SPADES,
  canPass,
  cardLabel,
  classify,
  describeCombo,
  explainIllegalPlay,
  legalMovesForView,
  legalPlaysForView,
  makeRng,
} from "../engine";
import { CardFace } from "./CardFace";
import { Felt, GameOver, Opponent } from "./Board";
import { Logo } from "./Logo";
import { dealtCounts, FINISH_MS, openingMessage, type DealPresentation } from "./dealPresentation";
import { nameOf, possessiveOf, seatAt, usePlayers } from "./players";
import { sortHand, type HandSort, type Settings } from "./settings";
import "./game-presentation.css";

/** Clicking anything else, like the table or empty space, drops the current selection. */
const KEEPS_SELECTION = "button, a, input, .overlay";

const HAND_SORTS: Record<HandSort, { next: HandSort; symbol: string; label: string }> = {
  "rank-asc": { next: "rank-desc", symbol: "↑", label: "rank ascending" },
  "rank-desc": { next: "suit", symbol: "↓", label: "rank descending" },
  suit: { next: "rank-asc", symbol: "♠", label: "suit" },
};

export function nextHandSort(order: HandSort): HandSort {
  return HAND_SORTS[order].next;
}

interface Props {
  /** The game from my seat: my hand, everyone's card counts, the table. */
  view: PlayerView;
  /** False while a bot's turn has not been shown yet, so its highlight lands just before its card. */
  turnShown: boolean;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  /** Shown in the header, like "Won 1 of 3". */
  record: string;
  recordContent?: ReactNode;
  opening: DealPresentation;
  reducedMotion: boolean;
  playbackPending?: boolean;
  dealCode: string | null;
  onMove: (move: Move) => void;
  onOpenMenu: () => void;
  onOpenRules: () => void;
  onToggleDarkMode?: () => void;
  /** A countdown shown next to the status while it is my turn. */
  turnClock?: ReactNode;
  /** Shown in the middle of the header, like an online room's code. */
  headerCenter?: ReactNode;
  /** What the player can do once the game is over. */
  gameOverActions: ReactNode;
  /** Dialogs drawn over the game. */
  children?: ReactNode;
}

export function GameScreen({
  view,
  turnShown,
  settings,
  onSettings,
  record,
  recordContent,
  opening,
  reducedMotion,
  playbackPending = false,
  dealCode,
  onMove,
  onOpenMenu,
  onOpenRules,
  onToggleDarkMode,
  turnClock,
  headerCenter,
  gameOverActions,
  children,
}: Props) {
  const players = usePlayers();
  const [selected, setSelected] = useState<Card[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const openingActive = opening.phase !== "ready";
  const myTurn = view.turn === view.seat && view.winner === null && !openingActive && !playbackPending;
  const hasSelection = selected.length > 0;
  const [showGameOver, setShowGameOver] = useState(
    () => view.winner !== null && !openingActive,
  );

  useEffect(() => {
    if (view.winner === null || openingActive) {
      setShowGameOver(false);
      return;
    }
    if (view.instantWin || reducedMotion) {
      setShowGameOver(true);
      return;
    }
    const id = window.setTimeout(() => setShowGameOver(true), FINISH_MS);
    return () => window.clearTimeout(id);
  }, [view.winner, view.instantWin, openingActive, reducedMotion]);

  const clearSelection = useCallback(() => {
    setSelected([]);
    setHint(null);
  }, []);

  // A new game starts with an empty history; stale selections must not carry over.
  const lastLength = useRef(view.history.length);
  useEffect(() => {
    if (view.history.length < lastLength.current) clearSelection();
    lastLength.current = view.history.length;
  }, [view.history.length, clearSelection]);

  useEffect(() => {
    if (!myTurn) clearSelection();
  }, [myTurn, clearSelection]);

  useEffect(() => {
    if (!hasSelection) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest(KEEPS_SELECTION))) return;
      clearSelection();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [hasSelection, clearSelection]);

  const toggle = useCallback(
    (card: Card) => {
      if (!myTurn) return;
      setHint(null);
      setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
    },
    [myTurn],
  );

  const reason = hasSelection ? explainIllegalPlay(view, selected) : null;
  const canPlay = myTurn && hasSelection && reason === null;
  const legalCount = useMemo(() => (myTurn ? legalPlaysForView(view).length : 0), [myTurn, view]);

  const doPlay = () => {
    if (!canPlay) return;
    onMove({ type: "play", cards: selected });
    clearSelection();
  };
  const doPass = () => {
    onMove({ type: "pass" });
    clearSelection();
  };
  const doHint = () => {
    const move = heuristicBot.choose(view, legalMovesForView(view), makeRng(view.history.length));
    if (move.type === "play") {
      setSelected(move.cards);
      setHint(null);
    } else {
      setSelected([]);
      setHint("Hint: pass this one.");
    }
  };

  let status: string;
  let tone: "info" | "warn" | "ok" = "info";
  if (opening.phase === "dealing") status = "Dealing…";
  else if (opening.phase === "intro") status = openingMessage(view, nameOf(players, view.turn));
  else if (view.winner !== null) status = "Game over.";
  else if (playbackPending && view.turn === view.seat) status = "Catching up…";
  else if (!myTurn) status = turnShown ? `${nameOf(players, view.turn)} is playing…` : "";
  else if (hasSelection && reason) {
    status = reason;
    tone = "warn";
  } else if (hasSelection) {
    status = `Ready to play ${describeCombo(classify(selected)!)}.`;
    tone = "ok";
  } else if (hint) status = hint;
  else if (view.table) {
    status =
      legalCount === 0
        ? "Nothing in your hand beats that. Pass."
        : `Beat ${possessiveOf(players, view.table.seat)} ${describeCombo(view.table.combo)}.`;
  } else if (view.openingRequired) status = `You hold ${cardLabel(THREE_OF_SPADES)}. Lead with it.`;
  else status = "Your lead. Play any combination.";

  const counts = dealtCounts(opening.dealt, view.seat);
  const displayedView = openingActive
    ? { ...view, hand: view.hand.slice(0, counts[view.seat]), handSizes: counts, winner: null }
    : view;
  const displayedHand = sortHand(displayedView.hand, settings.handSort);
  const handSort = HAND_SORTS[settings.handSort];

  return (
    <div className="app">
      <header className="topbar game-topbar">
        <Logo onToggleDarkMode={onToggleDarkMode} />
        {headerCenter && (
          <span className="topbar-center" data-testid="room-code">
            {headerCenter}
          </span>
        )}
        <div className="meta">
          {recordContent ?? <span data-testid="record">{record}</span>}
          <button
            type="button"
            className="icon-btn"
            aria-label="Rules"
            aria-haspopup="dialog"
            title="Rules"
            onClick={onOpenRules}
          >
            Rules
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Menu and settings"
            aria-haspopup="dialog"
            title="Menu and settings"
            onClick={onOpenMenu}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
              <path d="m19.4 15 1.1 1.9-2.1 2.1-1.9-1.1a8 8 0 0 1-2 .8l-.5 2.2h-3l-.5-2.2a8 8 0 0 1-2-.8l-1.9 1.1-2.1-2.1L5.6 15a8 8 0 0 1-.8-2L2.6 12.5v-3L4.8 9a8 8 0 0 1 .8-2L4.5 5.1 6.6 3l1.9 1.1a8 8 0 0 1 2-.8l.5-2.2h3l.5 2.2a8 8 0 0 1 2 .8L18.4 3l2.1 2.1L19.4 7a8 8 0 0 1 .8 2l2.2.5v3l-2.2.5a8 8 0 0 1-.8 2Z" transform="translate(0 1)" />
            </svg>
          </button>
        </div>
      </header>

      <main className="board">
        <Opponent seat={seatAt(players, 2)} view={displayedView} turnShown={turnShown && !openingActive} dealing={openingActive} />
        <Opponent seat={seatAt(players, 1)} view={displayedView} turnShown={turnShown && !openingActive} dealing={openingActive} />
        <Felt view={displayedView} showLog={settings.moveLog} />
        <Opponent seat={seatAt(players, 3)} view={displayedView} turnShown={turnShown && !openingActive} dealing={openingActive} />
        {opening.phase === "dealing" && opening.dealt > 0 && (
          <span key={opening.dealt} className={`dealing-card deal-to-${(opening.dealt - 1) % 4}`} aria-hidden="true" />
        )}
      </main>

      <section className={`player${myTurn ? " active" : ""}`} aria-label="Your hand">
        <div className="player-heading">
          <button
            type="button"
            className="sort-button"
            aria-label={`Sort hand: ${handSort.label}. Next: ${HAND_SORTS[handSort.next].label}.`}
            title={`Sort: ${handSort.label}`}
            onClick={() => onSettings({ ...settings, handSort: nextHandSort(settings.handSort) })}
          >
            Sort {handSort.symbol}
          </button>
          <p className={`status ${tone}`} role="status" data-testid="status">
            {status}
            {myTurn && turnClock}
          </p>
        </div>
        <div className="hand" data-testid="hand">
          {displayedHand.map((c) => (
            <CardFace key={c} card={c} selected={selected.includes(c)} onToggle={toggle} />
          ))}
        </div>
        <div className="actions">
          <span className="hand-count">{displayedHand.length} {displayedHand.length === 1 ? "card" : "cards"}</span>
          <div className="action-buttons">
            <button type="button" onClick={doPass} disabled={!myTurn || !canPass(view)}>
              Pass
            </button>
            {settings.hints && (
              <button type="button" onClick={doHint} disabled={!myTurn}>
                Hint
              </button>
            )}
            <button type="button" onClick={clearSelection} disabled={!hasSelection}>
              Clear
            </button>
            <button type="button" className="primary" onClick={doPlay} disabled={!canPlay}>
              Play
            </button>
          </div>
        </div>
      </section>

      {view.winner !== null && !openingActive && showGameOver && (
        <GameOver view={view} dealCode={dealCode} actions={gameOverActions} />
      )}
      {children}
    </div>
  );
}
