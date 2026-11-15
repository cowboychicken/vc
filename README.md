# VC_13

A free browser game of Tiến Lên Miền Nam (Tien Len), the Vietnamese 13-card game also known as Thirteen. Quick Play matches you with other people; create a room to invite friends. No sign-up, no database.

```sh
npm install
npm run dev        # play at http://localhost:5173 (online rooms work too)
npm test           # engine, bots, session, protocol, room and HTTP tests
npm run build      # typecheck + web app (dist/) + server bundle (dist-server/)
npm start          # serve the built app and the room API on http://localhost:3000
```

## Playing

The landing page offers **Quick Play**, **Create Room**, and **Join Room** by code. Quick Play joins a random room with a present player and an open bot seat; if none is available, it creates and starts a room. Create Room starts a new game and gives you a code to share. Bots fill open seats. The public app currently offers multiplayer only.

In a game, tap **?** for the rules and **i** for the menu. The **Online** tab shows the room code and players and lets you update your name and colour; the host can kick another player. In **Settings**, only the host can change the room rules or bot level (rules are locked during a game). Each player can change their own bot-animation speed, hints, move log and dark mode; those preferences are saved on that device.

The room code is shown in the header and **Online** tab; tap it to copy. Friends can enter it on the landing page or open a `?room=ABC234` link to join. A joiner takes the next bot seat, even mid-game. If the host kicks someone, that seat becomes a bot and the kicked player's saved token is rejected; without accounts, they can still return as a new participant. Everyone gets a random funny name and colour. A player who drops out is covered by a bot until they return. The host starts each game, and the previous winner leads the next one.

Online deals are random. The deal code shown at the end is for reference; the public app does not load or replay deals. Deal-code parsing and local single-player components remain in the source but are not exposed in the current app flow.

**Turn timer.** You have 15 seconds to move. If time runs out, a bot plays that move for you and you get a strike. On your third strike in a room you lose your seat to a bot and can't take it back (the room says so if you try); leaving the room resets your strikes. If you were the only person in the room, the room is deleted. Players who are away are already covered by a bot and get no strikes. The countdown appears next to the status line on your turn.

Dark mode is in **Settings**; tapping the logo three times quickly also toggles it. The smiley appears after the logo has been hovered or focused for three seconds.

Tap or hover over your **Won** record online to see each participant's wins, games and win rate for that room. A completed game counts for everyone who occupied a seat during it; a win goes to whoever occupied the winning seat at the end, including a player covered by a bot while away. Stats survive leaving and returning on the same device while its room token is saved, as long as another human keeps the room alive; they disappear when the room closes or the server restarts.

## Hosting it

One Node process serves the app and the room API. Rooms live in memory (a restart ends any games in progress).

For the intended `vc13.gg` deployment:

1. Point the domain's registrar nameservers to Cloudflare and wait for the zone to become active.
2. Add `vc13.gg` and `www.vc13.gg` as published hostnames on the Cloudflare Tunnel, pointing to Traefik's reachable HTTP entrypoint.
3. Check that the shared Docker network and Traefik entrypoint in `docker-compose.yml` match your server. Do not publish the app's port directly.
4. Start the container, then check `/api/health` on both hostnames and create and join a room from another device.

The public landing page contains crawlable game and rules text, while the page title, description, social metadata, and structured data describe Tiến Lên Miền Nam and its common English/Vietnamese names. `robots.txt` and `sitemap.xml` are served from the site root.

The two hostnames have separate browser storage, so settings and saved room seats are not shared between them.

```sh
docker compose up -d --build   # see docker-compose.yml for the Traefik labels to adjust
# or, without Docker:
npm run build && PORT=3000 npm start
```

`TRUST_PROXY=true` is only for running behind your own trusted proxy that supplies trustworthy client IP headers. The Compose file enables it for the intended setup. Details, environment variables and hosting notes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#8-build-and-deployment).

## Docs

- [AGENTS.md](AGENTS.md): start here if you are going to change the code (commands, layout, rules of the road, gotchas).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it all fits together, the online protocol, deployment, decisions.
- [docs/VC_Game_Rules.md](docs/VC_Game_Rules.md): the card rules.
- [docs/plan.md](docs/plan.md): original scope and implementation history.

The engine (`src/engine`) is pure TypeScript with no UI imports, and it runs both in the browser and on the server. Bots (`src/bots`) get only their own `PlayerView` and the legal moves.
