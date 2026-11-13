import { type Bot, botMove, heuristicBot } from "../bots";
import {
  type GameState,
  type Move,
  type NewGameOptions,
  type RuleOptions,
  applyMove,
  makeRng,
  newGame,
} from "../engine";

export const HUMAN = 0;
export const SEAT_NAMES = ["You", "Bot One", "Bot Two", "Bot Three"] as const;

export interface Session {
  game: GameState;
  /** Options that produced `game`, so the same deal can be replayed. */
  start: NewGameOptions;
  played: number;
  won: number;
}

export type SessionAction =
  | { type: "human"; move: Move }
  | { type: "bot"; bot?: Bot }
  | { type: "rematch"; seed: number }
  | { type: "restart"; seed: number }
  | { type: "sameDeal" }
  | { type: "rules"; rules: RuleOptions };

function begin(prev: Pick<Session, "played" | "won">, start: NewGameOptions): Session {
  const game = newGame(start);
  return { game, start, ...tally(prev, game) };
}

function tally({ played, won }: Pick<Session, "played" | "won">, game: GameState) {
  if (game.winner === null) return { played, won };
  return { played: played + 1, won: won + (game.winner === HUMAN ? 1 : 0) };
}

export const initSession = (start: NewGameOptions): Session => begin({ played: 0, won: 0 }, start);

function advance(session: Session, move: Move): Session {
  const game = applyMove(session.game, move);
  return { ...session, game, ...tally(session, game) };
}

export function reduceSession(session: Session, action: SessionAction): Session {
  const { game } = session;
  switch (action.type) {
    case "human":
      if (game.winner !== null || game.turn !== HUMAN) return session;
      try {
        return advance(session, action.move);
      } catch {
        return session;
      }
    case "bot": {
      if (game.winner !== null || game.turn === HUMAN) return session;
      const rng = makeRng(game.seed * 31 + game.history.length);
      return advance(session, botMove(game, action.bot ?? heuristicBot, rng));
    }
    case "rematch":
      if (game.winner === null) return session;
      return begin(session, { seed: action.seed, leader: game.winner, rules: game.rules });
    case "restart":
      return begin(session, { seed: action.seed, rules: game.rules });
    case "sameDeal":
      return begin(session, session.start);
    case "rules":
      // House rules apply immediately, and carry into later deals and replays.
      if (JSON.stringify(game.rules) === JSON.stringify(action.rules)) return session;
      return { ...session, game: { ...game, rules: action.rules }, start: { ...session.start, rules: action.rules } };
  }
}
