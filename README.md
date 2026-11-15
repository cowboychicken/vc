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

The landing page offers **Quick Play**, **Create Room**, and **Join Room** by code. Quick Play joins a random room with a present player and an open bot seat; if none is available, it creates and starts a room. Create Room starts a new game and gives you a code to share. Bots fill open seats in multiplayer games.

Tap **?** for the rules (tap outside the box to close it), and **i** for the menu: new or restarted deal, the deal code, and settings (bombs beat 2s only or anything, bot level and speed, hint button, move log; saved in `localStorage`).

Cards are dealt around the table before a short opening message. The move log shows up to five recent moves when there is room.

**Deal codes.** Every deal has a short code like `0000-0727`, shown when the game ends. Tap it to copy it. Save it, or paste it into the menu's deal code box, to replay the same cards and the same starting player. The code is also a link: `?code=0000-0727`. A mistyped code is rejected rather than loading a different deal. House rules and bot settings are not part of a code. The long form `?seed=123&leader=0..3` still works.

**Online.** The room code is shown at the top of the screen. Tap the room code (header or Online tab) to copy it, and friends can enter it on the landing page or open a `?room=ABC234` link to drop in. A joiner takes the next bot seat, even mid-game. The host can kick another human; that seat becomes a bot and the kicked player's saved seat token is rejected. Everyone gets a random funny name and colour (change yours any time in the **Online** tab: colour saves as you pick it, a name saves with its button). A player who drops out is covered by a bot until they come back. The host chooses the rules and starts each game, and the previous winner leads the next one. Online deals are always random: there is no replaying a deal or entering a deal code in a room. Your seat is remembered on your device, so reloading or locking your phone puts you back where you were.

Tap or hover over your **Won** record online to see each participant's wins, games and win rate for that room. A completed game counts for everyone who occupied a seat during it; a win goes to whoever occupied the winning seat at the end, including a player covered by a bot while away. Stats survive leaving and returning on the same device while its room token is saved, but disappear when the room closes or the server restarts.

## Hosting it

One Node process serves the app and the room API. Rooms live in memory (a restart ends any games in progress).

For the intended `vc13.gg` deployment:

1. Point the domain's registrar nameservers to Cloudflare and wait for the zone to become active.
2. Add `vc13.gg` and `www.vc13.gg` as published hostnames on the Cloudflare Tunnel, pointing to Traefik's reachable HTTP entrypoint.
3. Check that the shared Docker network and Traefik entrypoint in `docker-compose.yml` match your server. Do not publish the app's port directly.
4. Start the container, then check `/api/health` on both hostnames and create and join a room from another device.

The public landing page describes the game for search engines and AI crawlers. `robots.txt` and `sitemap.xml` are served from the site root.

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
- [docs/plan.md](docs/plan.md): scope, decisions and status.

The engine (`src/engine`) is pure TypeScript with no UI imports, and it runs both in the browser and on the server. Bots (`src/bots`) get only their own `PlayerView` and the legal moves.
