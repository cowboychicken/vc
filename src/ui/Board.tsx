import {
  INSTANT_WIN_LABELS,
  type HistoryEntry,
  type PlayerView,
  cardsLabel,
  describeCombo,
} from "../engine";
import { CardFace } from "./CardFace";
import { HUMAN, SEAT_NAMES } from "./session";

const POSITIONS = ["bottom", "left", "top", "right"] as const;

export const possessive = (seat: number): string => (seat === HUMAN ? "your" : `${SEAT_NAMES[seat]}'s`);

export function describeEntry(e: HistoryEntry): string {
  const who = SEAT_NAMES[e.seat];
  return e.combo ? `${who} played ${cardsLabel(e.combo.cards)}` : `${who} passed`;
}

export function Opponent({ seat, view }: { seat: number; view: PlayerView }) {
  const count = view.handSizes[seat]!;
  const active = view.turn === seat && view.winner === null;
  const passed = view.passed[seat] && view.winner === null;
  const cls = ["opp", `opp-${POSITIONS[seat]}`, active ? "active" : "", passed ? "passed" : ""].join(" ");
  return (
    <div className={cls} data-testid={`opponent-${seat}`}>
      <div className="opp-name">{SEAT_NAMES[seat]}</div>
      <div className="opp-count" role="img" aria-label={`${count} cards left`}>
        {count}
      </div>
      <div className="opp-status" aria-live="polite">
        {view.winner === seat
          ? "Winner!"
          : view.winner !== null
            ? ""
            : active
              ? "Thinking…"
              : passed
                ? "Passed"
                : count <= 2
                  ? "Almost out!"
                  : ""}
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
            {SEAT_NAMES[table.seat]} · {describeCombo(table.combo)}
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
              {describeEntry(e)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface GameOverProps {
  view: PlayerView;
  onRematch: () => void;
  onSameDeal: () => void;
}

export function GameOver({ view, onRematch, onSameDeal }: GameOverProps) {
  const won = view.winner === HUMAN;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="over-title">
      <div className="dialog">
        <h2 id="over-title">{won ? "You win" : `${SEAT_NAMES[view.winner!]} wins`}</h2>
        {view.instantWin && (
          <p className="instant">
            Instant win — {INSTANT_WIN_LABELS[view.instantWin]} dealt to {view.winner === HUMAN ? "you" : SEAT_NAMES[view.winner!]}.
          </p>
        )}
        <div className="reveal">
          {view.revealed?.map((hand, seat) =>
            hand.length === 0 || seat === HUMAN ? null : (
              <div key={seat} className="reveal-row">
                <span className="reveal-name">{SEAT_NAMES[seat]}</span>
                <span className="reveal-cards">
                  {hand.map((c) => (
                    <CardFace key={c} card={c} small />
                  ))}
                </span>
              </div>
            ),
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onRematch} autoFocus>
            Play again{view.winner === HUMAN ? "" : ` (${SEAT_NAMES[view.winner!]} leads)`}
          </button>
          <button type="button" onClick={onSameDeal}>
            Replay this deal
          </button>
        </div>
      </div>
    </div>
  );
}
