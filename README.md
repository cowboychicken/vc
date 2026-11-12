# VC_13

A light browser game: quick Tiến Lên (Miền Nam rules) against three bots. No sign-up, no server.

```sh
npm install
npm run dev        # play at http://localhost:5173  (add ?seed=123 to replay a specific deal)
npm test           # engine, bots and session tests
npm run build      # typecheck + static build into dist/
```

- Rules: [docs/VC_Game_Rules.md](docs/VC_Game_Rules.md)
- Plan, decisions and status: [docs/plan.md](docs/plan.md)

The engine (`src/engine`) is pure TypeScript with no UI imports. Bots (`src/bots`) get only their own `PlayerView` and the legal moves.
