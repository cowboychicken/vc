import type { Move, PlayerView, Rng } from "../engine";

/**
 * A bot sees only its own PlayerView and the list of legal moves, and must return one of them.
 * An RL policy can implement this same interface later.
 */
export interface Bot {
  name: string;
  choose(view: PlayerView, legal: readonly Move[], rng: Rng): Move;
}
