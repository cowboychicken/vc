## Plan: Lightweight Tiến Lên Game

Build a light browser game focused on quick play against three bots. Players can start immediately as guests; login can be added later to preserve stats or history. The existing docs are proposals, not commitments.

**Steps**
1. Define the first release as anytime games, one player versus three bots, one hand through winner and replay. No daily challenge, online multiplayer, or tournament scoring initially.
2. Choose a recognized rules variant, then resolve the draft’s open rule details in [VC_Game_Rules.md](docs/VC_Game_Rules.md). Keep variant-specific decisions in the rules layer without building multiple variants prematurely.
3. Build and test a deterministic game engine with legal-action generation, seeded shuffling, turn transitions, and privacy-safe player views.
4. Add simple bots that select only legal actions. Keep an interface for future RL, but defer Gymnasium/PPO until the game works.
5. Build a direct-to-play UI with clear card selection, table and opponent status, turn feedback, end state, and replay. Decide on React, FastAPI, and other technical choices based on runtime and deployment needs rather than assuming the docs are binding.
6. Add optional login only when there’s a clear persistence need. It should never prevent guest play.
7. Verify seeded games and manually test a complete guest game on desktop and mobile, including replay and hidden-hand privacy.

**Relevant files**
- [docs/VC_Game_Rules.md](docs/VC_Game_Rules.md) — authoritative rules after choosing the variant.
- [docs/plan.md](docs/plan.md) — revise the proposed phases around the agreed MVP.
- [docs/API_Contracts.md](docs/API_Contracts.md) — revisit only if a client/server boundary is chosen.
- [docs/AI_RL_Environment.md](docs/AI_RL_Environment.md) and [docs/Tech_Architecture.md](docs/Tech_Architecture.md) — keep exploratory until the engine and runtime choices are clearer.

**Decisions so far**
- Quick games anytime; no daily challenge in the initial version.
- Guest-first; optional quick login later, likely for saving stats or history.
- Baseline bots first; RL remains a future extension.
- Still open: Miền Nam or Miền Bắc rules, framework/runtime, and login provider.

**Verification**
- Test combinations, special plays, turn/pass/reset flow, and game completion against the chosen rules.
- Run seeded bot games and check that all actions are legal, cards are accounted for, games terminate, and bot hands stay private.
- Confirm a guest can start, finish, and replay a game without setup on desktop and mobile.