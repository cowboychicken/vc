// Variant-specific rules (Miền Nam). Everything else in the engine is variant-neutral.
import { type Card, rankOf, sortCards, TWO_RANK, THREE_OF_SPADES } from "./cards";
import type { Combo } from "./combos";

/**
 * Chop strength. 0 means "not a bomb".
 * 3-pair run = 1, four of a kind = 2, 4-pair run = 3, 5-pair run = 4, ...
 */
export function bombPower(c: Combo): number {
  if (c.kind === "quad") return 2;
  if (c.kind === "pairRun") {
    const pairs = c.cards.length / 2;
    return pairs === 3 ? 1 : pairs;
  }
  return 0;
}

/** Bomb power needed to chop a hand of 2s. */
const POWER_NEEDED_FOR_TWOS: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

/**
 * Plays that are not the same kind and size: a bomb over 2s of sufficient size, or a stronger bomb
 * over a bomb. Same kind and size is handled by the caller (compare top cards).
 */
export function canChop(prev: Combo, next: Combo): boolean {
  const power = bombPower(next);
  if (power === 0) return false;
  const prevPower = bombPower(prev);
  if (prevPower > 0) return power > prevPower;
  const isTwos = rankOf(prev.top) === TWO_RANK && prev.cards.length <= 3;
  if (!isTwos) return false;
  return power >= (POWER_NEEDED_FOR_TWOS[prev.cards.length] ?? Infinity);
}

/** The opening play of the very first game must contain the 3♠. */
export const containsOpeningCard = (cards: readonly Card[]): boolean => cards.includes(THREE_OF_SPADES);

export type InstantWin = "fourTwos" | "dragon" | "sixPairs";

export const INSTANT_WIN_LABELS: Record<InstantWin, string> = {
  fourTwos: "Four 2s",
  dragon: "Dragon (3 through A)",
  sixPairs: "Six pairs",
};

/** Tới trắng: a hand that wins the instant it is dealt. */
export function instantWin(hand: readonly Card[]): InstantWin | null {
  const counts = new Array<number>(13).fill(0);
  for (const c of sortCards(hand)) counts[rankOf(c)]!++;
  if (counts[TWO_RANK] === 4) return "fourTwos";
  if (counts.slice(0, TWO_RANK).every((n) => n >= 1)) return "dragon";
  const pairs = counts.reduce((sum, n) => sum + Math.floor(n / 2), 0);
  if (pairs >= 6) return "sixPairs";
  return null;
}
