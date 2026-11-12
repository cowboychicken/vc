import type { Bot } from "./types";

/** Picks uniformly among legal moves. Useful as a baseline and for fuzz testing the engine. */
export const randomBot: Bot = {
  name: "random",
  choose(_view, legal, rng) {
    return legal[Math.floor(rng() * legal.length)]!;
  },
};
