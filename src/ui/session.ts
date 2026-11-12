import { heuristicBot, botMove } from "../bots";
import { type GameState, type Move, type NewGameOptions, applyMove, makeRng, newGame } from "../engine";

export const HUMAN = 0;
export const SEAT_NAMES = ["You", "Bot 1", "Bot 2", "Bot 3"] as const;

export interface Session {
  game: GameState;
  /** Options that produced `game`, so the same deal can be replayed. */
  start: NewGameOptions;
  played: number;
  won: number;
}

export type SessionAction =
  | { type: "human"; move: Move }
  | { type: "bot" }
  | { type: "rematch"; seed: number }
  | { type: "sameDeal" };

function begin(prev: Pick<Session, "played" | "won">, start: NewGameOptions): Session {
  const game = newGame(start);
  return { game, start, ...tally(prev, game) };
}

function tally({ played, won }: Pick<Session, "played" | "won">, game: GameState) {
  if (game.winner === null) return { played, won };
  return { played: played + 1, won: won + (game.winner === HUMAN ? 1 : 0) };
}

export const initSession = (seed: number): Session => begin({ played: 0, won: 0 }, { seed });

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
      return advance(session, botMove(game, heuristicBot, rng));
    }
    case "rematch":
      if (game.winner === null) return session;
      return begin(session, { seed: action.seed, leader: game.winner });
    case "sameDeal":
      return begin(session, session.start);
  }
}
