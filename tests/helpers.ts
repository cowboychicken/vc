import { type Card, RANK_LABELS, SUIT_SYMBOLS, classify, type Combo } from "../src/engine";

/** "10♥" -> card id */
export function c(label: string): Card {
  const suit = SUIT_SYMBOLS.findIndex((s) => label.endsWith(s));
  const rank = RANK_LABELS.findIndex((r) => r === label.slice(0, -1));
  if (suit < 0 || rank < 0) throw new Error(`Bad card: ${label}`);
  return rank * 4 + suit;
}

/** "3♠ 3♥" -> card ids */
export const cs = (labels: string): Card[] => labels.split(/\s+/).filter(Boolean).map(c);

export function combo(labels: string): Combo {
  const result = classify(cs(labels));
  if (!result) throw new Error(`Not a combination: ${labels}`);
  return result;
}
