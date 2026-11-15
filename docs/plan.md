# VC_13 (Tiến Lên): Plan

**Goal:** a light browser game for quick play, alone against three bots or online with friends. Anyone can start immediately. There are no accounts. Identity is a name and colour kept on the device. How it is built is in [ARCHITECTURE.md](./ARCHITECTURE.md); the rest of `/docs` marked exploratory or superseded is background only.

## 1. Scope

- **Single player:** one human versus three bots, one hand through to a winner, then replay. Done.
- **Online multiplayer:** up to 4 humans per room, empty seats played by bots. Done.
- Miền Nam rules, defined in [VC_Game_Rules.md](./VC_Game_Rules.md), with one optional house rule ("bombs beat anything").
- Still out of scope: daily challenge, tournament scoring, chop payments, logins and persisted stats.

## 2. Tech decisions

- **Language:** TypeScript everywhere. The engine is pure logic with no I/O, so the same code runs in the browser (single player) and on the server (online referee).
- **Engine:** pure TypeScript, immutable state, seeded `mulberry32` shuffling, no UI, DOM or Node imports.
- **UI:** React with Vite and plain CSS. Mobile-first, tap to select. Flat black-and-white look.
- **Online:** a small Node relay server with **long polling**. The server owns the game and sends each seat only its own `PlayerView`; rooms are in memory; seats are claimed with a random token stored on the device. No WebSockets, accounts or database. Reasons and trade-offs are in [ARCHITECTURE.md](./ARCHITECTURE.md#10-decisions-and-trade-offs).
- **Hosting:** one container (Docker) behind Traefik and a Cloudflare Tunnel on a home server, with Tailscale for SSH. The intended domain is vc13.gg.
- **Tests:** Vitest, with no browser harness; UI behaviour is checked by hand in a real browser.
- **Bots:** a `Bot` interface that receives only a `PlayerView` and the legal moves. A baseline heuristic bot and a random bot ship first.
- **Deferred:** FastAPI, Gymnasium and PPO (see [Tech_Architecture.md](./Tech_Architecture.md), [AI_RL_Environment.md](./AI_RL_Environment.md), [API_Contracts.md](./API_Contracts.md)). If RL is wanted later, train in Python against a port of the engine and ship the policy through the existing `Bot` interface (for example as ONNX in the browser or on the server).

## 3. Layout

```
src/
├── engine/        # Pure game logic: cards, combos, legal plays, game state, variant rules, deal codes
├── bots/          # Bot interface, heuristic and random bots, bot levels, playOut simulation helper
├── net/           # Shared by browser and server: wire protocol, presenter; browser-only fetch client
├── ui/            # React UI: GameScreen (shared), LocalGame, online/ (OnlineApp, useRoom), menu, board
└── main.tsx
server/            # Node: room manager, HTTP API + long poll, static files, production entry
tests/             # Vitest: engine, game, bots, deal codes, session, protocol, rooms, HTTP, presenter
Dockerfile, docker-compose.yml
```

## 4. Steps and status

1. **Release scope.** Done (section 1).
2. **Rules variant.** Done: Miền Nam, written up in [VC_Game_Rules.md](./VC_Game_Rules.md).
3. **Engine.** Done: deterministic, with legal-move generation, seeded shuffling, turn and pass flow, and `PlayerView`, which hides other hands until the game ends.
4. **Bots.** Done: heuristic and random bots that only ever return a legal move.
5. **UI.** Done: starts directly in a game, tap to select, play/pass/hint/clear, turn and error feedback, game-over dialog with *Play again* (the winner leads) and *Replay this deal* (same seed). The **?** button opens the rules; the **i** menu has game actions and settings stored in `localStorage`. Every deal has a short code (`XXXX-XXXX`) that copies when tapped, can be typed back in, or opened as `?code=`. The end screen shows everyone's cards in seat order: the winner's last play (marked "winning hand") and what the others still held. Bots light up first and their card appears a beat later, and clicking anywhere but a card or button clears the selection. Bots are named Bot One, Bot Two and Bot Three.
6. **Online multiplayer.** Done:
   - Create a room or join by code or link (`?room=`), with a name and a colour from a contrast-checked palette.
   - One tap creates a room and deals at once (no lobby); friends who arrive take a bot's seat, even mid-game. Everyone gets a random funny name and colour, editable in the Online tab. The host starts each later game; the first game opens with the 3♠, later games are led by the last winner, and online deals are always random (no deal codes or replays in a room).
   - The host sets the rules (between games) and the bot level; everyone sets their own speed, hints and move log.
   - A dropped or idle player is covered by a bot and resumes on return; the host role passes on if the host leaves or is away; a reload or a locked phone returns you to your seat.
   - The server runs the bots and is the referee; players only ever see their own hand.
   - Dockerfile and compose file for the home server.
7. **Verification.** `npm test` covers rules, flow, seeded bot games, the room model with a fake clock, the HTTP API (including long polls and static files) and the presenter. Online play was also exercised in a real browser with two players (desktop and phone widths), including whole games, reloads, network loss and leaving, against both the dev server and the production bundle. The Docker image was built and run. A real Cloudflare Tunnel and Traefik have not been tested.
8. **Login.** Dropped. Nothing in the game needs it.

## 5. Possible next steps

- Stronger bots (card counting from `history`, hand-planning), evaluation by self-play with `playOut`, and eventually a trained model (see section 2).
- Scoring and chop payments, and the Miền Bắc variant behind the `rules.ts` seam.
- Spectators, in-room chat, or a rematch vote.
- Persisted stats, if that is ever wanted.
