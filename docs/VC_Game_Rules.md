# Tiến Lên Rules (Miền Nam / Southern variant)

Authoritative rules for the engine in `src/engine`. Variant-specific decisions (chop table, instant wins, opening card) live in `src/engine/rules.ts`, so another variant can be added later without touching the rest of the engine.

## 1. Deck & Dealing

- 52-card deck, no jokers. 4 seats, 13 cards each. Seats are people or bots: one human against three bots, or up to four humans online with bots in the empty seats.
- Dealing is a seeded shuffle, so a seed fully reproduces a deal.

## 2. Card Hierarchy

- Rank, low to high: `3 4 5 6 7 8 9 10 J Q K A 2`.
- Suit, low to high: ♠ < ♣ < ♦ < ♥.
- A card's strength is `rank * 4 + suit`. Combinations of the same kind and size are compared by their highest card, so a pair of 5♥ 5♠ beats a pair of 5♦ 5♣ (the ♥ is the higher top card).

## 3. Combinations

| Kind | Definition |
| --- | --- |
| Single | One card |
| Pair | Two cards of the same rank |
| Triple | Three cards of the same rank |
| Run | 3+ cards of consecutive rank. No 2s and no wrap-around (J-Q-K-A-2 and Q-K-A-2-3 are invalid) |
| Four of a kind | Four cards of the same rank (a bomb) |
| Pair run | 3+ consecutive pairs, no 2s (a bomb) |

## 4. Chops (bombs against 2s and bombs)

Bomb power: 3-pair run = 1, four of a kind = 2, 4-pair run = 3, 5-pair run = 4, and so on.

- A single 2 can be chopped by any bomb.
- A pair of 2s needs power 2 or more: four of a kind or a 4+ pair run.
- A triple of 2s needs power 3 or more: a 4+ pair run.
- A bomb beats a bomb of lower power. Bombs of the same kind and size compare by top card.
- A bomb can only be played on a 2 or another bomb, or led as an ordinary combination.
- Bombs are played in turn. There is no out-of-turn play.
- Chopping carries no scoring or payment in the MVP.

### House rule: bombs beat anything (off by default)

Settings → **Bombs beat → Anything**. When on, `RuleOptions.bombsBeatAnything` is set on the game and:

- A bomb can be played on any play, including 2s of any size.
- A bomb played on another bomb must end in a higher card (rank, then suit), whatever the kinds of the two bombs. So four 7s can be beaten by a run of pairs ending in 8♥, and a 3-pair run cannot beat four 7s unless it ends higher.
- A non-bomb still can never beat a bomb.

The setting takes effect immediately, including on the deal in progress, and carries into later deals and replays.

## 5. Game flow

- **First game:** the holder of 3♠ leads, and the opening play must contain the 3♠ (as a single, in a pair, triple, run, and so on).
- **Later games:** the previous winner leads and may open with anything.
- **Following:** play the same kind and size with a higher top card, or chop as described above.
- **Passing:** you cannot pass when leading. A player who passes is locked out until the table is cleared.
- **Clearing the table:** when every other player has passed, the last player to play wins the round, the table clears, and they lead.
- **Turn order:** seats 0 to 3, skipping players who have passed.
- **Replay:** after a game, either start a new deal (the winner leads) or replay the same deal from the same seed.
- **Online rooms:** the host starts each game. The first game follows the rule above (3♠ holder opens); every later game is led by the previous winner, unless the host starts one from a deal code, which fixes the deal and the leader exactly. A bot covers any seat whose human is away or has left. The house rule can only be changed between games.
- **Deal code:** every deal has a short code (seed plus who leads) that reproduces it exactly. House rules are a separate setting and are not in the code.

## 6. Winning

- The first player to empty their hand wins and the game ends immediately. There is no ranking of the other seats.
- **Instant wins (tới trắng):** checked right after dealing, before any card is played. If several players qualify, the first in turn order starting from the leader wins.
  - Four 2s.
  - Dragon: one of every rank from 3 through A.
  - Six pairs: each rank contributes `floor(count / 2)` pairs, so four of a kind counts as two pairs.

## 7. Not in the MVP

Scoring and payments, chop-over-chop penalties, rankings beyond first place, other regional variants, daily challenge.
