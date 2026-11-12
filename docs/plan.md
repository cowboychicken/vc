# Tiến Lên: Plan

**Goal:** a light browser game for quick play against three bots. Guests can start immediately, and login can come later to keep stats or history. Everything else in `/docs` is exploratory.

## 1. MVP scope

- Anytime games: one human versus three bots, one hand through to a winner, then replay.
- Miền Nam rules, defined in [VC_Game_Rules.md](./VC_Game_Rules.md).
- No daily challenge, online multiplayer, tournament scoring or login in the first release.

## 2. Tech decisions

- **Runtime:** TypeScript only, running in the browser. The engine is pure logic with no I/O, so a server would add latency, hosting and state management for no gain. Bots move instantly, the game works offline, and it deploys as static files.
- **Engine:** pure TypeScript, immutable state, seeded `mulberry32` shuffling, and no UI or DOM imports.
- **UI:** React with Vite and plain CSS. Mobile-first and tap to select.
- **Tests:** Vitest.
- **Bots:** a `Bot` interface that receives only a `PlayerView` and the legal moves. A baseline heuristic bot and a random bot ship first.
- **Deferred:** FastAPI, Gymnasium and PPO (see [Tech_Architecture.md](./Tech_Architecture.md), [AI_RL_Environment.md](./AI_RL_Environment.md), [API_Contracts.md](./API_Contracts.md)). If RL is wanted later, train in Python against a port of the engine and ship the policy through the existing `Bot` interface (for example as ONNX in the browser). If login and cloud saves are wanted, add a small backend then.

## 3. Layout

```
src/
├── engine/        # Pure game logic: cards, combos, legal plays, game state, variant rules
│   ├── cards.ts   #   card ids, seeded RNG, dealing
│   ├── combos.ts  #   classify(cards), beats(prev, next)
│   ├── rules.ts   #   Miền Nam specifics: chop power, instant wins, opening card
│   ├── legal.ts   #   allCombos(hand), legalPlays(hand, table, opening)
│   └── game.ts    #   newGame, applyMove, legalMoves, viewFor (privacy-safe PlayerView)
├── bots/          # Bot interface, heuristic and random bots, playOut simulation helper
├── ui/            # React UI: session reducer, hand and table components, styles
└── main.tsx
tests/             # Vitest: engine rules, game flow, seeded bot games, session reducer
```

## 4. Steps and status

1. **Release scope.** Done (section 1).
2. **Rules variant.** Done: Miền Nam, written up in [VC_Game_Rules.md](./VC_Game_Rules.md).
3. **Engine.** Done: deterministic, with legal-move generation, seeded shuffling, turn and pass flow, and `PlayerView`, which hides other hands until the game ends.
4. **Bots.** Done: heuristic and random bots that only ever return a legal move.
5. **UI.** Done: starts directly in a game, tap to select, play/pass/hint/clear, turn and error feedback, game-over dialog with *Play again* (the winner leads) and *Replay this deal* (same seed). `?seed=N` in the URL replays a specific deal.
6. **Optional login.** Not started. Add it only when there is a persistence need, and never gate guest play on it. The session already tracks wins in memory.
7. **Verification.** `npm test` covers combinations, chops, instant wins, turn/pass/reset flow, and seeded bot games that check legality, card conservation, termination and hidden hands. The UI was also played end to end at desktop and phone widths.

## 5. Possible next steps

- Scoring and chop payments, and the Miền Bắc variant behind the `rules.ts` seam.
- Stronger bots (card counting from `history`, hand-planning), and evaluation by self-play with `playOut`.
- Persisted stats and optional login.
- RL, as described in section 2.

