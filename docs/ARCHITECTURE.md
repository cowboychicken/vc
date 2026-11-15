# VC_13 architecture

How the game is built, why, and where the sharp edges are. For commands and the short list of rules to follow when changing things, start with [AGENTS.md](../AGENTS.md). For the card rules themselves, see [VC_Game_Rules.md](./VC_Game_Rules.md).

## 1. The big picture

```
 browser (React)                                   Node server (optional, for online rooms)
 ───────────────                                   ────────────────────────────────────────
 LocalGame ──┐                                      app.ts  HTTP routes + long poll
             ├─► GameScreen ─► Board                rooms.ts RoomManager (all the logic)
 OnlineApp ──┘      ▲                                  │  uses ▼
   │ useRoom        │ PlayerView                   ┌──────────────────────────┐
   │  └ presenter   │                              │ src/engine  (pure rules) │ ◄── same code
   └ net/client ────┼── fetch / long poll ───────► │ src/bots    (pure bots)  │     in both places
                    │                              └──────────────────────────┘
 src/engine, src/bots also run in the browser for single player
```

- **One engine, two homes.** `src/engine` and `src/bots` are plain TypeScript with no DOM and no Node APIs. Single player runs them in the browser. Online rooms run the very same code on the server, which acts as the referee.
- **One screen, two sources.** `GameScreen` only knows how to draw a `PlayerView` for "my seat" and report a `Move`. `LocalGame` feeds it from a local reducer; `OnlineApp` feeds it from the network.
- **Nothing is stored server-side.** Rooms live in memory and disappear when everyone leaves (or the server restarts). The browser stores a name, a colour, settings and seat tokens in `localStorage`.

## 2. The engine (`src/engine`)

| File | Responsibility |
| --- | --- |
| `cards.ts` | Card ids (0 to 51; strength = `rank * 4 + suit`), `makeRng` (mulberry32), seeded Fisher–Yates shuffle, dealing. |
| `combos.ts` | `classify(cards)` into single, pair, triple, run, four of a kind or pair run; `beats(prev, next, rules)`. |
| `rules.ts` | Miền Nam specifics: bomb power, which bombs chop which 2s, instant wins, the 3♠ opening, and `RuleOptions` (house rules). |
| `legal.ts` | `allCombos(hand)` and `legalPlays(hand, table, opening)`. |
| `game.ts` | `GameState`, `newGame`, `applyMove`, `legalMoves`, `viewFor`, `PlayerView` helpers (`legalMovesForView`, `canPass`, `explainIllegalPlay`). |
| `dealCode.ts` | `encodeDeal` / `decodeDeal`. |

Key properties:

- **Deterministic and immutable.** `applyMove(state, move)` returns a new state. The only randomness is the shuffle, from a 32-bit seed. The same seed and leader always produce the same deal.
- **`GameState` is private, `PlayerView` is public.** `viewFor(state, seat)` returns your hand, everyone's *card counts*, the table, pass flags and history. Other hands are revealed only once the game is over. Bots, the UI and the wire protocol only ever see a `PlayerView`.
- **House rule.** `RuleOptions.bombsBeatAnything` (default `false` in the engine; the UI defaults it on). When on, a bomb beats any play, and a bomb beats a bomb only by ending in a higher card. The flag lives on the game state, so it can change between games and replays.
- **Deal code.** `XXXX-XXXX`: a 32-bit seed and a leader (0 = nobody, so the 3♠ holder opens; 1–4 = seat 0–3), packed into 7 Crockford base-32 digits plus a check digit with odd weights, so any single-character typo is rejected. House rules are not part of it. Decoding is forgiving (case, dashes, `O`→`0`, `I`/`L`→`1`).

## 3. Bots (`src/bots`)

- A `Bot` is `{ name, choose(view, legalMoves, rng) }`. It gets only its own `PlayerView`, so it cannot cheat.
- `randomBot` (level **easy**) picks any legal move. `heuristicBot` (level **normal**) goes out if it can; otherwise it plays the cheapest candidate by a cost that prefers low cards and longer combinations, avoids breaking pairs, triples and quads, and saves 2s and bombs (though it will chop a 2). When following, it passes if even its best play is too expensive. When an opponent is down to 2 cards or fewer it turns "desperate" and spends 2s and bombs freely; against a single last card it answers with its highest single and avoids leading singles. It knows nothing the `PlayerView` doesn't show.
- `botMove(game, bot, rng)` adapts a `Bot` to a full `GameState`, and `playOut` simulates whole games (used by tests and for future bot evaluation).
- **Adding a smarter or trained bot:** implement `Bot`, add it to `BOT_BY_LEVEL` and `BOT_LEVELS` in `levels.ts`, and widen `BotLevel` and `parseBotLevel` (`src/net/protocol.ts`). The UI rows (`BotLevelRow`) read the same list. A learned policy would need the same inputs a human has: the `PlayerView`, including `history`.

## 4. The UI (`src/ui`)

```
App ─┬─ LocalGame ───────────────┐
     └─ OnlineApp                ├──► GameScreen ─ Board (Opponent, Felt, GameOver), CardFace
                  └ useRoom      │          ▲
                    └ presenter ─┘          └─ PlayersContext (who sits where, names, colours, away)
```

- **`GameScreen`** owns the local interaction only: selected cards, hint, status line, and "click anywhere else clears the selection". It receives `view`, `turnShown`, callbacks and a `gameOverActions` node, so the two modes differ only in what they pass.
- **Identity UI.** `profile.ts` gives a first-time visitor a random funny name (`FUNNY_NAMES`) and colour, saved in `vc13.profile`, so creating or joining a room never asks for anything. `ProfileEditor` (in the online menu tab) saves a colour the moment it is picked and a name with its Save button. The room code shows in the middle of the header (`GameScreen`'s `headerCenter`) and at the top of the online menu tab.
- **Copying codes.** Every shown deal code or room code is a `CopyCode` (`CopyCode.tsx`): tap or click to copy it, with a short "copied" message from the single `ToastHost` mounted in `App`. There are no separate copy buttons and no invite link (`?room=CODE` links still open a room).
- **Rules.** The `?` button in the header opens `RulesDialog` (`Rules.tsx`) over the game, in single player and online alike; tapping outside it, Escape or × closes it. Single player pauses the bots while it is open. The rules are not a menu tab.
- **End screen.** `GameOver` (`Board.tsx`) lists every player in seat order with the same look: the winner's row shows their last play (`winningPlay` in `engine/game.ts`, or the dealt hand after an instant win) with a muted "(winning hand)" note, and the others show what they still held. Online, the host's only action is *Start next game*: no deal-code field and no replay.
- **`PlayersContext`** (`players.tsx`) says who is at each seat. `relSeat`/`seatAt` rotate the table so *you* are always at the bottom (left, top and right follow clockwise). Single player uses `LOCAL_PLAYERS`; online builds it from the room with `playersFromRoom`.
- **`turnShown`** exists so a bot's seat lights up *before* its card lands. `LocalGame` does this with a two-step timer. Online, the presenter drives it (section 6).
- **`Menu.tsx`** is a generic tabbed dialog plus reusable rows (`BombRow`, `BotLevelRow`, `PersonalRows`). `LocalGame` and `OnlineApp` each assemble their own tabs.
- **Settings and storage** (`settings.ts`, `profile.ts`, `online/seats.ts`) are small wrappers around `localStorage`, each tolerant of storage being blocked or corrupt. Keys: `vc13.settings`, `vc13.profile`, `vc13.rooms`.
- **URLs** (`url.ts`): `?code=XXXX-XXXX` (or `?seed=N&leader=0..3`) opens a single-player deal; `?room=ABC234` opens an online room.
- **Responsive layout:** a single CSS file, with a phone layout under 700 px (a square table with the top opponent just above it).

## 5. Online play: the model

The server is a **relay and referee**, not a push service. The idea that makes it simple: with at most four people, each client just *asks* for news.

- A room keeps an append-only list of **frames**. A frame is "the game after this step" (a deal or a move). Stored frames hold a full `GameState`; what goes on the wire is `viewFor(state, seat)` for the asking seat.
- Each client remembers the last frame number `since` and the room revision `rev` it has seen, and long-polls `GET /api/rooms/:code/updates?since=N&rev=R&wait=25`. The server answers the moment there is something newer, or after `wait` seconds with "nothing new". Then the client asks again.
- Anything you *do* (move, start, settings, profile) is a `POST` that returns the same shape as a poll, so your own screen updates without waiting for the next poll.
- Frames are retained (the newest 40) and at most 12 are sent per response. A client that fell far behind just jumps to the newest.

### Identity

There are no accounts. Joining returns a random 128-bit **seat token**; the client keeps it in `localStorage` (`vc13.rooms`, six newest rooms) and sends it as `Authorization: Bearer <token>`. The server looks the seat up by token (constant-time compare), so no seat number is ever sent. Present the saved token when joining again (after a reload, a locked phone, or a crash) and you get your seat back. A name and a colour are just display settings. Names are unique per room (a clash becomes "Sam 2"), and bot names are always reserved.

### Endpoints

All `/api/rooms*` calls need the header `x-vc13-version: <PROTOCOL_VERSION>` (otherwise `426 outdated`). Errors are `{ error, message }` with codes `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `outdated`, `rate_limited`, `too_large`, `server_error`.

| Call | Who | Does |
| --- | --- | --- |
| `GET /api/health` | anyone | `{ ok, rooms }`, used by the container healthcheck. |
| `POST /api/rooms` | anyone | Create a room (name, colour, optional rules and bot level). You become the host in seat 0. Rate limited per IP. |
| `GET /api/rooms/:code` | anyone | Peek: `RoomInfo` without joining (404 if gone). |
| `POST /api/rooms/:code/join` | anyone | Take the lowest bot seat (even mid-game), or reclaim yours with `token`. `409` if full. |
| `GET /api/rooms/:code/updates?since&rev&wait` | member | Long poll. Marks you as present. |
| `POST /api/rooms/:code/move` | member | Play or pass. Validated by the engine. |
| `POST /api/rooms/:code/start` | host | Start the first or next game with a random deal (a body with `dealCode` is rejected with `400`). Only from `lobby` or `over`. (The client creates a room and starts it at once, so there is no lobby screen.) |
| `POST /api/rooms/:code/settings` | host | Rules (only between games) and bot level (any time). |
| `POST /api/rooms/:code/profile` | member | Change your name and colour. |
| `POST /api/rooms/:code/leave` | member | Give up the seat; a bot takes it over. |

Types, validators, name/colour rules and room-code handling are all in `src/net/protocol.ts`, shared by client and server.

### Room behaviour

- **Phases:** `lobby` (only for an instant between creating a room and the client's first start) → `playing` → `over` → (host starts again) `playing` …
- **Seats:** the host starts in seat 0. Empty seats are bots named by seat: Bot One, Bot Two and Bot Three for seats 1 to 3 (and Bot Four if seat 0 is ever vacated). A joiner takes the lowest bot seat.
- **Who leads:** the first game opens with the 3♠ holder. Later games are led by the previous winner. The deal is always random: online play never loads a deal from a code (`RoomManager.start` takes an optional deal code only so tests can fix a deal; the HTTP layer never passes one).
- **Bots run on the server.** After every human action the server plays all consecutive bot turns (`advanceBots`) and stops at a present human or the end of the game. The client is shown them as separate frames, flagged `bot: true`.
- **Away takeover.** A human not heard from for 45 s is marked *away* and a bot plays their turns. They resume the moment they poll again.
- **Host handover.** If the host leaves, or is away, the host role moves to the lowest-numbered present human. It does not move back when the old host returns (unless the new one also goes away).
- **Expiry.** A room is deleted when its last human leaves, or after 30 minutes with nobody present. At most 200 rooms exist at once.

## 6. Showing what happened (the presenter)

The server answers instantly, so a human's move and the following bot moves arrive as one batch. `net/presenter.ts` is a small pure reducer + scheduler that replays a batch so it feels like single player: a bot's seat lights up, then its card lands, then a short gap. Timing is the *viewer's own* bot-speed setting (`BOT_TIMING`), so two players can watch at different speeds.

- First sight of a game (joining or reloading) shows the latest frame immediately.
- A deal, or a move by a person, shows at once.
- More than 6 frames waiting (you came back after a while) jumps to the latest.
- Frames are de-duplicated by number, so overlapping responses never replay a move.

`useRoom` (`ui/online/useRoom.ts`) is the glue: it joins or creates once, runs the poll loop, applies responses (monotonic `rev`), feeds the presenter and exposes actions.

Resilience built into the loop:

- Network errors back off 0.5 s → 8 s and show a "Reconnecting…" banner. After a failure the next request uses `wait=0`, so the banner clears as soon as the server answers.
- The poll is cut short and restarted when the tab becomes visible or the browser goes back online.
- `401` means the server forgot the seat: the client tries one fresh join. `404` means the room is gone; `426` means the page is out of date. Both show a clear message with *Try again* / *Play offline*.
- A poll that returns at once with nothing new is slowed to one per second, so a bug can never turn into a tight request loop.
- Leaving is explicit: it stops polling first, then tells the server, and forgets the stored token.

## 7. Server internals (`server/`)

| File | Role |
| --- | --- |
| `rooms.ts` | `RoomManager`: every rule of the room model above. It has no HTTP in it and takes injectable `now`, `randomInt` and `randomToken`, which is why it is tested with a fake clock. |
| `app.ts` | `createApi`: routing, the version check, body limit (4 KB), per-IP create rate limit (20 per 10 min), the long poll (wakes on `subscribe` notifications), error mapping, and a 5 s housekeeping `sweep`. |
| `static.ts` | Serves `dist/` with path-traversal protection and an SPA fallback to `index.html`. |
| `limits.ts` | A sliding-window `RateLimiter`. |
| `index.ts` | Production entry point: reads env, creates the HTTP server, handles `SIGTERM`/`SIGINT` (closes idle connections, cuts long polls after 3 s). |

In `npm run dev`, a Vite plugin (`roomApi` in `vite.config.ts`) loads `server/app.ts` through `ssrLoadModule` and mounts it on the dev server, so there is one port and no proxy. It is created once when Vite starts, so restart Vite after editing `server/`.

Hardening in place: seat tokens are random and compared in constant time; input is validated and size-limited; names are stripped of control, zero-width and bidi characters; colours are ids from a fixed contrast-checked palette; client IPs are only trusted from proxy headers when `TRUST_PROXY=true`; responses are `cache-control: no-store`; the server never serialises a `GameState`.

## 8. Build and deployment

`npm run build` produces `dist/` (the web app, about 82 kB gzipped) and `dist-server/index.js` (one file using only Node built-ins, so it runs without `node_modules`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Listen port. |
| `HOST` | `0.0.0.0` | Listen address. |
| `STATIC_DIR` | `dist` | Folder served for the web app. |
| `TRUST_PROXY` | `false` | Read the client address from `cf-connecting-ip` / `x-forwarded-for`. Set `true` only behind your own proxy. |

The `Dockerfile` is a two-stage `node:22-alpine` build that copies only `dist/` and `dist-server/`, runs as the unprivileged `node` user, and has a healthcheck on `/api/health`. `docker-compose.yml` adds Traefik labels (placeholders marked `CHANGE`) for the intended setup: **Cloudflare Tunnel → Traefik (plain HTTP entrypoint) → container**, with Tailscale only for SSH.

Things to remember when hosting:

- Cloudflare closes a quiet request at about 100 s. The long poll is 25 s, well under it. Keep it that way, and keep the server's keep-alive (65 s) above any proxy's idle timeout.
- One process holds all rooms. Don't run several replicas without sticky routing or shared state; for four friends a single container is the right size.
- Restarting the container ends all games (clients see a clear message and can make a new room).
- What was verified: the Docker image builds, runs as `node`, reports healthy, stops in under a second on `SIGTERM`, and rate-limits per forwarded IP. A real Cloudflare Tunnel and Traefik were **not** tested here, so confirm in your environment that long polls pass through (a 25 s request should complete, and `/api/health` should answer through the public hostname).

## 9. Testing

`npm test` runs Vitest with no browser. The layers:

| File | Covers |
| --- | --- |
| `engine.test.ts`, `game.test.ts` | Combinations, chops, instant wins, turn/pass/reset flow, hidden hands, card conservation. |
| `bots.test.ts` | Bots only ever return legal moves; seeded games terminate. |
| `dealCode.test.ts` | Round trips, typo rejection, forgiving input. |
| `session.test.ts` | The single-player reducer. |
| `protocol.test.ts` | Names, colours, room codes, validators. |
| `rooms.test.ts` | The whole room model with a fake clock: join, leave, host handover, away takeover, settings, start, expiry, hidden hands per seat, long-poll subscriptions. |
| `http.test.ts` | Real HTTP against an ephemeral server: routing, version check, limits, long-poll wake-up, static serving. |
| `presenter.test.ts` | Frame playback order and timing as pure data. |

There is no component-test harness. UI behaviour was checked in a real browser: two players (one desktop-sized, one phone-sized) creating, joining, playing whole games, rejoining after a reload, changing name/colour, losing and regaining the network, and leaving; plus the production bundle.

## 10. Decisions and trade-offs

- **Long polling over WebSockets.** For four players and one move every few seconds, polling is enough, works through any proxy, needs no extra dependency, and fails in obvious ways. A WebSocket or SSE channel could replace `updates` later without changing the frames model.
- **Server-authoritative.** It costs nothing extra (the engine is already pure) and removes a whole class of bugs and cheating. Clients never see other hands.
- **In-memory rooms, no database.** Games are short and casual. Persistence would add operations work for little value.
- **No accounts.** A name and colour on the device plus a seat token per room is all the identity the game needs.
- **Shared code over a shared schema.** Client and server import the same TypeScript types and validators, so the wire format can't drift. `PROTOCOL_VERSION` handles the remaining case of an old page talking to a new server.
- **Client-side pacing.** Keeping delays out of the server keeps it simple and lets each player choose their own speed.

## 11. Known limitations and ideas

- No spectators, chat, or per-room passwords (rooms are protected only by an unguessable 6-character code, about a billion combinations, which is fine for casual play).
- No scoring across games beyond a win count per seat, and no chop payments (Miền Bắc and other variants would go behind the `rules.ts` seam).
- A trained bot (see `docs/AI_RL_Environment.md` for early notes) would plug in through the `Bot` interface and `BOT_BY_LEVEL`; it needs no server changes.
- If the server ever needs to scale beyond one process, rooms would need sticky routing or a shared store.
