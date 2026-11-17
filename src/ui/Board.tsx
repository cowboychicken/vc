import type { ReactNode } from "react";
import { INSTANT_WIN_LABELS, type HistoryEntry, type PlayerView, cardsLabel, describeCombo, winningPlay } from "../engine";
import { CardFace } from "./CardFace";
import { CopyCode } from "./CopyCode";
import { Name, nameOf, relSeat, usePlayers } from "./players";

const POSITIONS = ["bottom", "left", "top", "right"] as const;

export function Entry({ entry }: { entry: HistoryEntry }) {
  return (
    <>
      <Name seat={entry.seat} /> {entry.combo ? `played ${cardsLabel(entry.combo.cards)}` : "passed"}
    </>
  );
}

export function Opponent({
  seat, view, turnShown, dealing = false,
}: { seat: number; view: PlayerView; turnShown: boolean; dealing?: boolean }) {
  const players = usePlayers();
  const count = view.handSizes[seat]!;
  const active = turnShown && view.turn === seat && view.winner === null;
  const passed = view.passed[seat] && view.winner === null;
  const away = players.away[seat] === true;
  const position = POSITIONS[relSeat(players, seat)];
  const cls = ["opp", `opp-${position}`, active ? "active" : "", passed ? "passed" : ""].join(" ");
  let playedThisRound = false;
  let passes = 0;
  for (const entry of view.history) {
    if (entry.combo && entry.seat === seat) playedThisRound = true;
    if (!entry.combo && ++passes === 3) {
      playedThisRound = false;
      passes = 0;
    }
  }
  const status =
    dealing
      ? ""
      : view.winner === seat
      ? "Winner!"
      : view.winner !== null
        ? ""
        : active
          ? "Playing…"
          : passed
            ? "Passed"
            : away
              ? "Away"
              : view.table && playedThisRound
                ? "Played"
                : "Waiting";
  return (
    <div className={cls} data-testid={`opponent-${seat}`}>
      <div className="opp-name">
        <Name seat={seat} />
      </div>
      <div className="opp-count" role="img" aria-label={`${count} ${count === 1 ? "card" : "cards"} left`}>
        <svg className="opp-card-icon" viewBox="0 0 16 22" fill="none" stroke="currentColor" aria-hidden="true">
          <rect x="1" y="1" width="14" height="20" />
          <rect x="3" y="3" width="10" height="16" strokeWidth="0.8" />
          <path d="M3 7 7 3M3 12l9-9M3 17 13 7M6 19l7-7M11 19l2-2" strokeWidth="0.8" />
        </svg>
        <span>{count} {count === 1 ? "card" : "cards"}</span>
      </div>
      <div className="opp-status" aria-live="polite">
        {status}
      </div>
    </div>
  );
}

export function Felt({ view, showLog }: { view: PlayerView; showLog: boolean }) {
  const { table, history } = view;
  const recent = history.slice(-5).reverse();
  return (
    <div className="felt" data-testid="table">
      {table ? (
        <div className="played" key={history.length}>
          <div className="played-label">
            <Name seat={table.seat} /> · {describeCombo(table.combo)}
          </div>
          <div className="played-cards" role="region" aria-label="Played cards, scroll to see more" tabIndex={0}>
            {table.combo.cards.map((c) => (
              <CardFace key={c} card={c} small />
            ))}
          </div>
        </div>
      ) : (
        <div className="played-label empty">Table clear</div>
      )}
      {showLog && (
        <ul className="ticker" aria-label="Recent moves">
          {recent.map((e, i) => (
            <li key={history.length - i} style={{ opacity: 1 - i * 0.12 }}>
              <Entry entry={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface GameOverProps {
  view: PlayerView;
  dealCode: string | null;
  /** Buttons or a waiting message, depending on who is allowed to continue. */
  actions: ReactNode;
}

export function GameOver({ view, dealCode, actions }: GameOverProps) {
  const players = usePlayers();
  const winner = view.winner!;
  const won = winner === players.me;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="over-title">
      <div className="dialog">
        <h2 id="over-title">
          {won ? (
            "You win"
          ) : (
            <>
              <Name seat={winner} /> wins
            </>
          )}
        </h2>
        {view.instantWin && (
          <p className="instant">
            Instant win — {INSTANT_WIN_LABELS[view.instantWin]} dealt to {won ? "you" : nameOf(players, winner)}.
          </p>
        )}
        {dealCode && (
          <p className="note deal-code">
            Deal code <CopyCode text={dealCode} label="Deal code" className="inline" testId="deal-code" />
          </p>
        )}
        <div className="reveal">
          {view.revealed?.map((held, seat) => {
            const isWinner = seat === winner;
            const cards = isWinner ? winningPlay(view) : held;
            return cards.length === 0 || (seat === players.me && !isWinner) ? null : (
              <div key={seat} className="reveal-row">
                <span className="reveal-name">
                  <Name seat={seat} />
                  {isWinner && <span className="reveal-note">(winning hand)</span>}
                </span>
                <span className="reveal-cards">
                  {cards.map((c) => (
                    <CardFace key={c} card={c} small />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
