// A card is an integer 0..51: id = rank * 4 + suit, so numeric order is strength order.
export type Card = number;

export const RANK_LABELS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const;
export const SUIT_SYMBOLS = ["♠", "♣", "♦", "♥"] as const;
export const SUIT_NAMES = ["spades", "clubs", "diamonds", "hearts"] as const;

export const DECK_SIZE = 52;
export const HAND_SIZE = 13;
export const NUM_PLAYERS = 4;
export const TWO_RANK = 12;
export const THREE_OF_SPADES: Card = 0;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const isTwo = (c: Card): boolean => rankOf(c) === TWO_RANK;
export const isRed = (c: Card): boolean => suitOf(c) >= 2;

export const cardLabel = (c: Card): string => `${RANK_LABELS[rankOf(c)]}${SUIT_SYMBOLS[suitOf(c)]}`;
export const cardsLabel = (cs: readonly Card[]): string => cs.map(cardLabel).join(" ");

export const sortCards = (cs: readonly Card[]): Card[] => [...cs].sort((a, b) => a - b);

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

export type Rng = () => number;

// mulberry32: small, fast, deterministic
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function deal(seed: number): Card[][] {
  const deck = shuffle(fullDeck(), makeRng(seed));
  return Array.from({ length: NUM_PLAYERS }, (_, p) =>
    sortCards(deck.slice(p * HAND_SIZE, (p + 1) * HAND_SIZE)),
  );
}
