# VC_13

A light browser game: quick Tiến Lên (Miền Nam rules) against three bots, or online with up to three friends. No sign-up, no database.

```sh
npm install
npm run dev        # play at http://localhost:5173 (online rooms work too)
npm test           # engine, bots, session, protocol, room and HTTP tests
npm run build      # typecheck + web app (dist/) + server bundle (dist-server/)
npm start          # serve the built app and the room API on http://localhost:3000
```

## Playing

Tap the **i** button for the menu: new or restarted deal, a link to the current deal, the rules, and settings (bombs beat 2s only or anything, bot level and speed, hint button, move log; saved in `localStorage`).

**Deal codes.** Every deal has a short code like `0000-0727` (shown in the menu and when a game ends). Save it, or type it into the menu's "Enter a deal code" box, to replay the same cards and the same starting player. The code is also a link: `?code=0000-0727`. A mistyped code is rejected rather than loading a different deal. House rules and bot settings are not part of a code. The long form `?seed=123&leader=0..3` still works.

**Online.** Menu → **Online**: pick a name and a colour, then *Create a room* or *Join* with a room code. Share the room link (`?room=ABC234`) and friends land straight in your lobby. Empty seats are played by bots, up to 4 people can join (even mid-game), and a player who drops out is covered by a bot until they come back. The host chooses the rules, starts each game, and the previous winner leads the next one. Your seat is remembered on your device, so reloading or locking your phone puts you back where you were.

## Hosting it

One Node process serves the app and the room API. Rooms live in memory (a restart ends any games in progress).

```sh
docker compose up -d --build   # see docker-compose.yml for the Traefik labels to adjust
# or, without Docker:
npm run build && PORT=3000 TRUST_PROXY=true npm start
```

`TRUST_PROXY=true` is only for running behind your own proxy (Cloudflare Tunnel, Traefik). Details, environment variables and hosting notes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#8-build-and-deployment).

## Docs

- [AGENTS.md](AGENTS.md): start here if you are going to change the code (commands, layout, rules of the road, gotchas).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it all fits together, the online protocol, deployment, decisions.
- [docs/VC_Game_Rules.md](docs/VC_Game_Rules.md): the card rules.
- [docs/plan.md](docs/plan.md): scope, decisions and status.

The engine (`src/engine`) is pure TypeScript with no UI imports, and it runs both in the browser and on the server. Bots (`src/bots`) get only their own `PlayerView` and the legal moves.
