import type { ReactNode } from "react";
import { INSTANT_WIN_LABELS, type HistoryEntry, type PlayerView, cardsLabel, describeCombo } from "../engine";
import { CardFace } from "./CardFace";
import { Name, nameOf, relSeat, usePlayers } from "./players";

const POSITIONS = ["bottom", "left", "top", "right"] as const;

export function Entry({ entry }: { entry: HistoryEntry }) {
  return (
    <>
      <Name seat={entry.seat} /> {entry.combo ? `played ${cardsLabel(entry.combo.cards)}` : "passed"}
    </>
  );
}

export function Opponent({ seat, view, turnShown }: { seat: number; view: PlayerView; turnShown: boolean }) {
  const players = usePlayers();
  const count = view.handSizes[seat]!;
  const active = turnShown && view.turn === seat && view.winner === null;
  const passed = view.passed[seat] && view.winner === null;
  const away = players.away[seat] === true;
  const position = POSITIONS[relSeat(players, seat)];
  const cls = ["opp", `opp-${position}`, active ? "active" : "", passed ? "passed" : ""].join(" ");
  const status =
    view.winner === seat
      ? "Winner!"
      : view.winner !== null
        ? ""
        : active
          ? "Thinking…"
          : passed
            ? "Passed"
            : away
              ? "Away"
              : count <= 2
                ? "Almost out!"
                : "";
  return (
    <div className={cls} data-testid={`opponent-${seat}`}>
      <div className="opp-name">
        <Name seat={seat} />
      </div>
      <div className="opp-count" role="img" aria-label={`${count} cards left`}>
        {count}
      </div>
      <div className="opp-status" aria-live="polite">
        {status}
      </div>
    </div>
  );
}

export function Felt({ view, showLog }: { view: PlayerView; showLog: boolean }) {
  const { table, history } = view;
  const recent = history.slice(-3).reverse();
  return (
    <div className="felt" data-testid="table">
      {table ? (
        <div className="played" key={history.length}>
          <div className="played-label">
            <Name seat={table.seat} /> · {describeCombo(table.combo)}
          </div>
          <div className="played-cards">
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
            <li key={history.length - i} style={{ opacity: 1 - i * 0.3 }}>
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
            Deal code <b>{dealCode}</b>
          </p>
        )}
        <div className="reveal">
          {view.revealed?.map((hand, seat) =>
            hand.length === 0 || seat === players.me ? null : (
              <div key={seat} className="reveal-row">
                <span className="reveal-name">
                  <Name seat={seat} />
                </span>
                <span className="reveal-cards">
                  {hand.map((c) => (
                    <CardFace key={c} card={c} small />
                  ))}
                </span>
              </div>
            ),
          )}
        </div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
