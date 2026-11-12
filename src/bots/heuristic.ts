import {
  type Combo,
  type Move,
  type PlayerView,
  TWO_RANK,
  classify,
  isBomb,
  isTwo,
  rankOf,
  suitOf,
} from "../engine";
import type { Bot } from "./types";

interface Candidate {
  move: Move;
  combo: Combo;
}

const BOMB_COST = 100;
const CHOP_BONUS = 95;
const TWO_COST = 6;
const BREAK_COST = 3;
const MAX_COST_WHEN_FOLLOWING = 14;

function rankCounts(hand: readonly number[]): number[] {
  const counts = new Array<number>(TWO_RANK + 1).fill(0);
  for (const c of hand) counts[rankOf(c)]!++;
  return counts;
}

/** Lower is better to play. Prefers low cards, long combinations, and keeping pairs, 2s and bombs intact. */
function cost(cand: Candidate, view: PlayerView, counts: number[], desperate: boolean): number {
  const { combo } = cand;
  const table = view.table?.combo ?? null;
  let c = rankOf(combo.top) + suitOf(combo.top) / 4;

  if (isBomb(combo)) {
    const chopsTwo = table !== null && !isBomb(table) && rankOf(table.top) === TWO_RANK;
    c += chopsTwo || desperate ? BOMB_COST - CHOP_BONUS : BOMB_COST;
    return c;
  }
  if (!table) c -= 1.5 * (combo.cards.length - 1);
  if (combo.cards.some(isTwo) && !desperate && view.hand.length > 3) c += TWO_COST;

  // Penalise splitting up a pair, triple or quad.
  for (const card of combo.cards) {
    const held = counts[rankOf(card)]!;
    if (held > 1 && (combo.kind === "run" || held > combo.cards.length)) c += BREAK_COST / combo.cards.length;
  }
  return c;
}

export const heuristicBot: Bot = {
  name: "heuristic",
  choose(view, legal, rng) {
    const pass = legal.find((m) => m.type === "pass");
    const plays: Candidate[] = legal.flatMap((m) =>
      m.type === "play" ? [{ move: m, combo: classify(m.cards)! }] : [],
    );
    if (plays.length === 0) return pass ?? legal[0]!;

    const goOut = plays.find((p) => p.combo.cards.length === view.hand.length);
    if (goOut) return goOut.move;

    const smallest = Math.min(...view.handSizes.filter((_, seat) => seat !== view.seat));
    const desperate = smallest <= 2;

    let pool = plays;
    // An opponent on their last card: answer a single with the highest single, and don't lead singles.
    if (smallest === 1) {
      const singles = plays.filter((p) => p.combo.kind === "single");
      if (view.table?.combo.kind === "single" && singles.length > 0) {
        return singles.reduce((a, b) => (b.combo.top > a.combo.top ? b : a)).move;
      }
      const others = plays.filter((p) => p.combo.kind !== "single");
      if (view.table === null && others.length > 0) pool = others;
    }

    const counts = rankCounts(view.hand);
    let best = pool[0]!;
    let bestCost = Infinity;
    for (const p of pool) {
      const score = cost(p, view, counts, desperate) + rng() * 0.4;
      if (score < bestCost) {
        best = p;
        bestCost = score;
      }
    }
    if (view.table && pass && !desperate && bestCost > MAX_COST_WHEN_FOLLOWING) return pass;
    return best.move;
  },
};
