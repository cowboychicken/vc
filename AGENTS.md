# VC_13: guide for developers and AI agents

A small browser card game: Tiến Lên (Miền Nam rules), 4 seats, played online with up to 4 people and bots in open seats. The public flow is multiplayer Quick Play or room invites; local single-player code remains hidden for now. React + Vite + TypeScript, plus a tiny Node server for online rooms. No accounts, no database.

Read this first. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the detail behind it, and [docs/VC_Game_Rules.md](docs/VC_Game_Rules.md) has the rules.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (default port 5173). Also serves the room API in-process, so online play works with no second server. |
| `npm test` | Vitest, all of `tests/` (about 200 tests, a few seconds). |
| `npm run typecheck` | `tsc --noEmit` over `src`, `server`, `tests` and the Vite configs. |
| `npm run build` | Typecheck, then the web app into `dist/`, then the server into `dist-server/index.js`. |
| `npm start` | Runs the production server (`dist-server/index.js`), which serves `dist/` and the API. Env: `PORT` (3000), `HOST` (0.0.0.0), `STATIC_DIR` (dist), `TRUST_PROXY` (false). |
| `docker compose up -d --build` | The same thing in a container. See the notes in `docker-compose.yml`. |

Before calling work done, run `npm run typecheck && npm test`; for anything that touches the UI or server, also `npm run build` and look at it in a browser.

## Where things live

```
src/engine/   Pure game rules. No DOM, no Node, no React. Deterministic (seeded).
src/bots/     Bots. They see only a PlayerView and the legal moves.
src/net/      Code shared by browser and server: protocol.ts (wire types, validators, names, colours,
              room codes), presenter.ts (frame playback, pure), client.ts (fetch wrapper, browser only).
server/       Node: rooms.ts (all room logic), app.ts (HTTP routes + long poll), static.ts, limits.ts, index.ts.
src/ui/       React. LandingPage, GameScreen (one seat-agnostic screen), LocalGame (retained but
              not exposed in the public app), online/ (OnlineApp, useRoom hook), Menu, Board,
              settings/profile/url helpers.
tests/        Vitest. Mirrors the layers: engine, game, bots, dealCode, session, protocol, rooms, http, presenter.
docs/         Rules, architecture, plan. Older exploratory docs are marked as such.
```

`index.html` contains the crawlable landing text and search/social metadata; `public/robots.txt` and `public/sitemap.xml` are the crawler files.

## Rules of the road (invariants)

1. **Keep `src/engine` and `src/bots` pure.** No imports from `react`, `node:*`, `src/ui`, `src/net` or `server`. The server imports the engine directly, so anything impure breaks it.
2. **Never leak a hidden hand.** Anything sent to a client or given to a bot must come from `viewFor(game, seat)` (a `PlayerView`). The server stores full `GameState` but only ever serialises per-seat views. Don't add a field to a wire type that carries other players' cards.
3. **The server is the referee online.** Clients send intent (a `Move`); the server validates with the engine and answers with state. Never trust the client's idea of whose turn it is or what is legal.
4. **Bump `PROTOCOL_VERSION`** (`src/net/protocol.ts`) whenever the wire format or rules change in a way an already-open page can't handle. Servers answer an old client with `426 outdated` and the page asks the player to reload.
5. **Validate all input at the edge.** Use the `parse*` helpers in `protocol.ts`; bodies are capped at 4 KB. Names are cleaned (`cleanName`), colours are sent by id (`PALETTE`), never as CSS.
6. **Rules live in one seam.** Variant behaviour is in `src/engine/rules.ts`, and house-rule flags are `RuleOptions` (currently `bombsBeatAnything`). Add a flag there, honour it where chops are decided (`rules.ts` and the chop checks in `game.ts`), then expose it in the UI (`Menu.tsx`, `settings.ts`) and in the room settings (`parseRules` in `protocol.ts`).
7. **Update tests and docs in the same change.** New engine behaviour gets a test in `tests/engine.test.ts` or `tests/game.test.ts`. New endpoints or room behaviour get tests in `tests/rooms.test.ts` / `tests/http.test.ts`.

## Defaults the owner chose on purpose (don't "fix" these)

- UI defaults in `src/ui/settings.ts`: bot speed `normal` (gap 300 ms / think 480 ms), and the house rule **bombs beat anything** on. The engine's own `DEFAULT_RULES` stays `bombsBeatAnything: false`.
- Look and feel: flat black and white, monospace, square corners, mobile first (phone layout under 700 px). No green felt.
- Header logo is `VC13.gg` (set in VT323); the tab title includes Tiến Lên Miền Nam for search. The repo and docs still say `VC_13`. Bots are `Bot One`, `Bot Two`, `Bot Three`.
- The logo's smile appears after three seconds of hover/focus; three quick taps toggle dark mode. Keep the hidden tap sequence intact unless asked to change it.
- Seeds and deal codes are not secret, and cheating prevention is not a goal. Online identity is only a local name and colour plus a per-room seat token. No logins.
- Deployment target is `vc13.gg` on a home server behind a Cloudflare Tunnel and Traefik (see `docker-compose.yml`).

## Gotchas

- **Online play and React StrictMode.** Dev mode runs effects twice. `useRoom` caches the create/join request per intent object (`WeakMap`) so one page never makes two rooms. Editing `src/ui/online/useRoom.ts` while a page is open hot-reloads that cache away and can make a "create" page create a second room. Reload the page after editing it.
- **The dev API reloads only on restart.** `vite.config.ts` loads `server/app.ts` through `ssrLoadModule` when the dev server starts. After editing anything in `server/`, restart `npm run dev`.
- **Long polls hold connections.** The client and server use the shared `POLL_SECONDS` in `protocol.ts` (2 s) so polls return well before the 5 s disconnect deadline. Keep the two intervals coordinated and below proxy idle timeouts.
- **Disconnects.** A human unheard from for 5 s is removed by `sweep`, and a bot takes their seat. The room is deleted when its last human leaves; a player can rejoin with their saved token only if the room and a bot seat remain.
- **Turn timer.** `RoomManager` times a present human's turn (`turnMs` 25 s plus `turnGraceMs` 4 s) and `sweep` enforces it; three strikes in a room removes the seat. The deadline is armed in `advanceBots`, so any new code path that changes whose turn it is must end by calling `advanceBots`. Tests use the injected clock (`turnMs`, `turnGraceMs`, `awayMs` options) and call `manager.sweep()` themselves. `sweepMs` is 1 s, so don't lengthen it without changing the grace.
- **Rooms are in memory.** Restarting the server ends every game. That is by design; clients get a 401/404 and show a clear message.
- **Timing lives on the client.** The server answers instantly; `presenter.ts` replays a batch of frames at each viewer's own bot speed. Don't add sleeps to the server.
- **Storage.** The only things stored are `localStorage` keys `vc13.settings`, `vc13.profile` and `vc13.rooms` (seat tokens, six newest rooms). All reads and writes are wrapped, because storage can be blocked (private mode, embedded frames).
- **Rate limit.** Room creation is limited per client IP (20 per 10 minutes). `TRUST_PROXY=true` makes it read `cf-connecting-ip` / `x-forwarded-for`; only set it behind your own proxy, or clients can spoof their address.

## Working in this repo (agent hygiene)

- Prefer small, surgical changes and don't commit unless asked. The working tree may already hold uncommitted work.
- Dev servers and browser pages may be shared with the owner. Start your own on a spare port (`npx vite --host 127.0.0.1 --port 5180 --strictPort`), stop only processes you started (by PID), and never leave viewport or touch emulation switched on in a shared page.
- To test two players in a browser, use two iframes on one page served from the dev origin, one of them with its `localStorage` keys namespaced by an init script keyed on `window.name`. Plain second tabs share storage and would just reclaim the first player's seat.
- Tests for time-dependent server behaviour inject `now` and `randomInt`; never use real timers or sleeps in `tests/rooms.test.ts`.
