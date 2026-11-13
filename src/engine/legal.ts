import { type Card, rankOf, sortCards, TWO_RANK } from "./cards";
import { type Combo, type ComboKind, beats } from "./combos";
import { DEFAULT_RULES, type RuleOptions, containsOpeningCard } from "./rules";

const LAST_RUN_RANK = TWO_RANK - 1; // ace; 2s never appear in runs

const make = (kind: ComboKind, cards: Card[]): Combo => {
  const sorted = sortCards(cards);
  return { kind, cards: sorted, top: sorted[sorted.length - 1]! };
};

function choose(cards: readonly Card[], k: number): Card[][] {
  const out: Card[][] = [];
  const rec = (start: number, picked: Card[]) => {
    if (picked.length === k) return void out.push([...picked]);
    for (let i = start; i < cards.length; i++) {
      picked.push(cards[i]!);
      rec(i + 1, picked);
      picked.pop();
    }
  };
  rec(0, []);
  return out;
}

/** Every combination that can be formed from `hand`, ignoring the table. */
export function allCombos(hand: readonly Card[]): Combo[] {
  const groups: Card[][] = Array.from({ length: TWO_RANK + 1 }, () => []);
  for (const c of sortCards(hand)) groups[rankOf(c)]!.push(c);
  const out: Combo[] = [];

  for (const g of groups) {
    for (const c of g) out.push(make("single", [c]));
    if (g.length >= 2) for (const p of choose(g, 2)) out.push(make("pair", p));
    if (g.length >= 3) for (const t of choose(g, 3)) out.push(make("triple", t));
    if (g.length === 4) out.push(make("quad", g));
  }

  // Runs and pair runs: extend over consecutive ranks, taking one card (or one pair) per rank.
  for (const [kind, width] of [["run", 1], ["pairRun", 2]] as const) {
    const options = groups.map((g) => (width === 1 ? g.map((c) => [c]) : g.length >= 2 ? choose(g, 2) : []));
    for (let start = 0; start <= LAST_RUN_RANK; start++) {
      let partial: Card[][] = [[]];
      for (let r = start; r <= LAST_RUN_RANK && options[r]!.length > 0; r++) {
        partial = partial.flatMap((p) => options[r]!.map((o) => [...p, ...o]));
        if (r - start + 1 >= 3) for (const cards of partial) out.push(make(kind, cards));
      }
    }
  }
  return out;
}

/** Legal plays for a hand facing `table`. `opening` restricts the lead to plays containing 3♠. */
export function legalPlays(
  hand: readonly Card[],
  table: Combo | null,
  opening: boolean,
  rules: RuleOptions = DEFAULT_RULES,
): Combo[] {
  let plays = allCombos(hand);
  if (table) plays = plays.filter((c) => beats(table, c, rules));
  else if (opening) plays = plays.filter((c) => containsOpeningCard(c.cards));
  return plays;
}
