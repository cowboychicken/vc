# VC_13

A light browser game: quick Tiến Lên (Miền Nam rules) against three bots. No sign-up, no server.

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # engine, bots and session tests
npm run build      # typecheck + static build into dist/
```

Tap the **i** button for the menu: new or restarted deal, a link to the current deal, the rules, and settings (bot level and speed, hint button, move log; saved in `localStorage`). A deal can be replayed with `?seed=123`, and `&leader=0..3` restores who led it.

- Rules: [docs/VC_Game_Rules.md](docs/VC_Game_Rules.md)
- Plan, decisions and status: [docs/plan.md](docs/plan.md)

The engine (`src/engine`) is pure TypeScript with no UI imports. Bots (`src/bots`) get only their own `PlayerView` and the legal moves.
