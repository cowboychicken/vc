import { type Card, rankOf, sortCards, TWO_RANK } from "./cards";
import { bombPower, canChop } from "./rules";

export type ComboKind = "single" | "pair" | "triple" | "quad" | "run" | "pairRun";

export interface Combo {
  kind: ComboKind;
  /** Cards sorted ascending. */
  cards: Card[];
  /** Highest card; decides comparisons between combos of the same kind and size. */
  top: Card;
}

const KIND_NAMES: Record<ComboKind, string> = {
  single: "single",
  pair: "pair",
  triple: "triple",
  quad: "four of a kind",
  run: "run",
  pairRun: "pair run",
};

export function describeCombo(c: Combo): string {
  if (c.kind === "run") return `run of ${c.cards.length}`;
  if (c.kind === "pairRun") return `${c.cards.length / 2}-pair run`;
  return KIND_NAMES[c.kind];
}

const rankCounts = (sorted: readonly Card[]): Map<number, number> => {
  const m = new Map<number, number>();
  for (const c of sorted) m.set(rankOf(c), (m.get(rankOf(c)) ?? 0) + 1);
  return m;
};

const consecutive = (ranks: number[]): boolean =>
  ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1);

/** Returns the combo these cards form, or null if they are not a valid combination. */
export function classify(input: readonly Card[]): Combo | null {
  const cards = sortCards(input);
  const n = cards.length;
  if (n === 0 || new Set(cards).size !== n) return null;
  const top = cards[n - 1]!;
  const counts = rankCounts(cards);
  const ranks = [...counts.keys()].sort((a, b) => a - b);

  if (ranks.length === 1) {
    if (n === 1) return { kind: "single", cards, top };
    if (n === 2) return { kind: "pair", cards, top };
    if (n === 3) return { kind: "triple", cards, top };
    return { kind: "quad", cards, top };
  }
  if (ranks.includes(TWO_RANK) || !consecutive(ranks)) return null;
  const values = [...counts.values()];
  if (n >= 3 && values.every((v) => v === 1)) return { kind: "run", cards, top };
  if (n >= 6 && values.every((v) => v === 2)) return { kind: "pairRun", cards, top };
  return null;
}

export const isBomb = (c: Combo): boolean => bombPower(c) > 0;

/** True if `next` may be played on top of `prev`. */
export function beats(prev: Combo, next: Combo): boolean {
  if (prev.kind === next.kind && prev.cards.length === next.cards.length) {
    return next.top > prev.top;
  }
  return canChop(prev, next);
}
