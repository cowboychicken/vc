import {
  type GameState,
  type Move,
  type Rng,
  applyMove,
  legalMovesForView,
  viewFor,
} from "../engine";
import type { Bot } from "./types";

/** Asks the bot for the current seat's move, giving it only that seat's view. */
export function botMove(state: GameState, bot: Bot, rng: Rng): Move {
  const view = viewFor(state, state.turn);
  const legal = legalMovesForView(view);
  const move = bot.choose(view, legal, rng);
  if (!legal.some((m) => sameMove(m, move))) {
    throw new Error(`${bot.name} chose an illegal move: ${JSON.stringify(move)}`);
  }
  return move;
}

export const sameMove = (a: Move, b: Move): boolean =>
  a.type === b.type &&
  (a.type === "pass" || (b.type === "play" && a.cards.length === b.cards.length && a.cards.every((c, i) => c === b.cards[i])));

/** Plays a game to completion with one bot per seat. Calls `onMove` after every move. */
export function playOut(
  start: GameState,
  bots: readonly Bot[],
  rng: Rng,
  onMove?: (state: GameState, move: Move) => void,
  maxMoves = 1000,
): GameState {
  let state = start;
  for (let i = 0; state.winner === null; i++) {
    if (i >= maxMoves) throw new Error("Game did not terminate");
    const move = botMove(state, bots[state.turn]!, rng);
    state = applyMove(state, move);
    onMove?.(state, move);
  }
  return state;
}
