import {
  type Card,
  NUM_PLAYERS,
  THREE_OF_SPADES,
  TWO_RANK,
  cardLabel,
  deal,
  rankOf,
  sortCards,
} from "./cards";
import { type Combo, beats, classify, describeCombo, isBomb } from "./combos";
import { legalPlays } from "./legal";
import {
  DEFAULT_RULES,
  type InstantWin,
  type RuleOptions,
  containsOpeningCard,
  describeBombNeededForTwos,
  instantWin,
} from "./rules";

export type Move = { type: "play"; cards: Card[] } | { type: "pass" };

export interface TablePlay {
  seat: number;
  combo: Combo;
}

/** A public event; everything in here is visible to every player. */
export interface HistoryEntry {
  seat: number;
  combo: Combo | null; // null = pass
}

export interface GameState {
  seed: number;
  /** Seat that started the game. */
  leader: number;
  rules: RuleOptions;
  hands: Card[][];
  turn: number;
  table: TablePlay | null;
  passed: boolean[];
  /** The next play must contain 3♠ (first game only). */
  openingRequired: boolean;
  winner: number | null;
  instantWin: InstantWin | null;
  history: HistoryEntry[];
}

/** What one seat is allowed to know. Other hands are only included once the game is over. */
export interface PlayerView {
  seat: number;
  rules: RuleOptions;
  hand: Card[];
  handSizes: number[];
  turn: number;
  table: TablePlay | null;
  passed: boolean[];
  openingRequired: boolean;
  winner: number | null;
  instantWin: InstantWin | null;
  history: HistoryEntry[];
  revealed: Card[][] | null;
}

export interface NewGameOptions {
  seed: number;
  /** Seat that leads freely. Omit for a first game: the 3♠ holder leads and must play it. */
  leader?: number;
  rules?: RuleOptions;
}

export function newGame({ seed, leader, rules = DEFAULT_RULES }: NewGameOptions): GameState {
  const hands = deal(seed);
  const first = leader === undefined;
  const start = first ? hands.findIndex((h) => h.includes(THREE_OF_SPADES)) : leader;
  const state: GameState = {
    seed,
    leader: start,
    rules,
    hands,
    turn: start,
    table: null,
    passed: new Array<boolean>(NUM_PLAYERS).fill(false),
    openingRequired: first,
    winner: null,
    instantWin: null,
    history: [],
  };
  for (let i = 0; i < NUM_PLAYERS; i++) {
    const seat = (start + i) % NUM_PLAYERS;
    const kind = instantWin(hands[seat]!);
    if (kind) return { ...state, winner: seat, instantWin: kind };
  }
  return state;
}

export function viewFor(state: GameState, seat: number): PlayerView {
  const over = state.winner !== null;
  return {
    seat,
    rules: state.rules,
    hand: [...state.hands[seat]!],
    handSizes: state.hands.map((h) => h.length),
    turn: state.turn,
    table: state.table,
    passed: [...state.passed],
    openingRequired: state.openingRequired,
    winner: state.winner,
    instantWin: state.instantWin,
    history: state.history,
    revealed: over ? state.hands.map((h) => [...h]) : null,
  };
}

/** Legal plays for the seat the view belongs to (empty unless it is that seat's turn). */
export function legalPlaysForView(view: PlayerView): Combo[] {
  if (view.winner !== null || view.turn !== view.seat) return [];
  return legalPlays(view.hand, view.table?.combo ?? null, view.openingRequired, view.rules);
}

export function canPass(view: Pick<PlayerView, "winner" | "turn" | "seat" | "table">): boolean {
  return view.winner === null && view.turn === view.seat && view.table !== null;
}

const TWOS_NAMES: Record<number, string> = { 1: "A single 2", 2: "A pair of 2s", 3: "A triple of 2s" };

function explainFailedBeat(table: Combo, play: Combo, rules: RuleOptions): string {
  if (isBomb(table)) {
    return rules.bombsBeatAnything
      ? "Beat that bomb with a bomb ending in a higher card."
      : "Beat that bomb with a stronger bomb.";
  }
  const twos = rankOf(table.top) === TWO_RANK && table.cards.length <= 3;
  if (isBomb(play)) {
    return twos
      ? `${TWOS_NAMES[table.cards.length]} needs ${describeBombNeededForTwos(table.cards.length)}.`
      : "That bomb can only beat 2s or another bomb.";
  }
  return twos || rules.bombsBeatAnything
    ? `Beat the ${describeCombo(table)} with a higher one or a bomb.`
    : `Needs a higher ${describeCombo(table)}.`;
}

/** Why `cards` can't be played right now, or null if they can. Written for display to the player. */
export function explainIllegalPlay(view: PlayerView, cards: readonly Card[]): string | null {
  if (view.winner !== null) return "The game is over.";
  if (view.turn !== view.seat) return "Wait for your turn.";
  if (cards.length === 0) return "Select cards to play.";
  if (!cards.every((c) => view.hand.includes(c))) return "Those cards are not in your hand.";
  const combo = classify(cards);
  if (!combo) return "Not a valid combination.";
  if (view.table) {
    if (!beats(view.table.combo, combo, view.rules)) return explainFailedBeat(view.table.combo, combo, view.rules);
  } else if (view.openingRequired && !containsOpeningCard(combo.cards)) {
    return `The opening play must include ${cardLabel(THREE_OF_SPADES)}.`;
  }
  return null;
}

export function legalMovesForView(view: PlayerView): Move[] {
  const moves: Move[] = legalPlaysForView(view).map((c) => ({ type: "play", cards: c.cards }));
  if (canPass(view)) moves.push({ type: "pass" });
  return moves;
}

export function legalMoves(state: GameState): Move[] {
  return legalMovesForView(viewFor(state, state.turn));
}

const nextOpenSeat = (passed: readonly boolean[], from: number): number => {
  for (let i = 1; i <= NUM_PLAYERS; i++) {
    const seat = (from + i) % NUM_PLAYERS;
    if (!passed[seat]) return seat;
  }
  return from;
};

/** Applies a move for the seat whose turn it is. Throws on an illegal move. */
export function applyMove(state: GameState, move: Move): GameState {
  if (state.winner !== null) throw new Error("Game is over");
  const seat = state.turn;
  const view = viewFor(state, seat);

  if (move.type === "pass") {
    if (!canPass(view)) throw new Error("Cannot pass when leading");
    const passed = state.passed.map((p, i) => (i === seat ? true : p));
    const history = [...state.history, { seat, combo: null }];
    const next = nextOpenSeat(passed, seat);
    if (next === state.table!.seat) {
      return {
        ...state,
        history,
        table: null,
        passed: passed.map(() => false),
        turn: next,
      };
    }
    return { ...state, history, passed, turn: next };
  }

  const reason = explainIllegalPlay(view, move.cards);
  if (reason) throw new Error(`Illegal play: ${reason}`);
  const combo = classify(move.cards)!;
  const played = new Set(combo.cards);
  const hands = state.hands.map((h, i) => (i === seat ? sortCards(h.filter((c) => !played.has(c))) : h));
  const next: GameState = {
    ...state,
    hands,
    table: { seat, combo },
    openingRequired: false,
    history: [...state.history, { seat, combo }],
  };
  if (hands[seat]!.length === 0) return { ...next, winner: seat };
  return { ...next, turn: nextOpenSeat(state.passed, seat) };
}
