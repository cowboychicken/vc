**Project:** VC (Tiến Lên) Card Game Web App & Reinforcement Learning AI **Objective:** Build a local-first, offline-capable card game engine in Python, wrapped in a FastAPI backend, with a Reinforcement Learning pipeline for training AI opponents.

#### **1\. Development Environment & Tech Stack**

* **Environment:** Ubuntu 22.04 LTS (via WSL), Python managed via `pyenv`.  
* **Game Engine:** Pure Python 3 (Strict typing, no web dependencies).  
* **Backend:** FastAPI, Uvicorn, Pydantic (REST HTTP POST architecture).  
* **AI/ML:** `Gymnasium` (RL Environment), `Stable-Baselines3` (PPO Algorithm), PyTorch.  
* **Frontend:** React or Vanilla JS (fetch API for backend communication).  
* **Context Files:** Copilot should reference `VC_Game_Rules.md`, `AI_RL_Environment.md`, and `API_Contracts.md` for strict logic constraints.

#### **2\. Target Directory Structure**

Plaintext

```
vc-card-game/
├── engine/                 # Pure Python Game Logic
│   ├── models.py           # Enums (Suit, Rank) and Pydantic Data Classes (Card, Player)
│   ├── rules_engine.py     # Validations (evaluate_combination, can_beat)
│   └── game_state.py       # Match flow, dealing, and turn tracking
├── backend/                # FastAPI Application
│   ├── main.py             # App initialization and API routes
│   └── schemas.py          # API request/response Pydantic models
├── ai/                     # Reinforcement Learning Pipeline
│   ├── vc_env.py           # Gymnasium custom environment wrapper
│   └── train.py            # Stable-Baselines3 PPO training loop script
├── frontend/               # UI Interface
│   ├── index.html          
│   └── app.js              
├── tests/                  # Unit tests for core logic
└── plan.md                 # This file
```

#### **3\. Implementation Phases**

**Phase 1: The Core Game Engine (Pure Python)**

* **Step 1.1 \- Data Models:** Create `engine/models.py`. Define `Suit` and `Rank` Enums. Create the `Card` class with `suit`, `rank`, and integer `value` (3 up to 15 for the 2).  
* **Step 1.2 \- Combination Logic:** Create `engine/rules_engine.py`. Write `evaluate_combination(cards)` to classify plays (Single, Pair, Triple, Sequence, Four-of-a-Kind, Pair-Sequence). Enforce no wrap-around and no 2s in sequences.  
* **Step 1.3 \- Combat Logic:** In `rules_engine.py`, write `can_beat(current_play, new_play)`. Implement suit tie-breakers and the specific Bomb/Slam rules (Bombs beat 2s and lower Bombs).  
* **Step 1.4 \- Match Flow:** Create `engine/game_state.py`. Build the `Game` class to handle shuffling, dealing 13 cards to 4 players, identifying the 3♠ lead, managing the turn order, and processing a `play_turn(player_id, cards)` action.

**Phase 2: The FastAPI Backend**

* **Step 2.1 \- API Schemas:** Create `backend/schemas.py`. Map the JSON payloads defined in `API_Contracts.md` into Pydantic BaseModel classes.  
* **Step 2.2 \- Endpoints:** Create `backend/main.py`. Initialize FastAPI. Build the `POST /api/v1/game/start`, `POST /api/v1/game/play`, and `POST /api/v1/game/pass` routes.  
* **Step 2.3 \- State Management:** Implement a lightweight in-memory store (like a Python dictionary) in `main.py` to hold active game instances by `game_id` while running locally.

**Phase 3: Reinforcement Learning Pipeline**

* **Step 3.1 \- Gym Environment:** Create `ai/vc_env.py`. Inherit from `gymnasium.Env`. Map the 52-card hand and table state to the Observation Space tensor.  
* **Step 3.2 \- Action Masking:** Implement the action mask logic in `vc_env.py` to ensure the AI can only select mathematically valid plays based on `engine/rules_engine.py`.  
* **Step 3.3 \- Reward System:** Implement the point system (-2 per remaining card, \-15 per remaining 2, \+20 for bombing a 2).  
* **Step 3.4 \- Training Loop:** Create `ai/train.py` to initialize the `PPO` model from `Stable-Baselines3` and run the self-play loop.

**Phase 4: Frontend & Integration**

* **Step 4.1 \- Basic UI:** Build a simple HTML/JS frontend to fetch the game state from the FastAPI backend and render the player's 13 cards.  
* **Step 4.2 \- Interaction:** Add click handlers to select valid combinations and send them to the `POST /api/v1/game/play` endpoint.  
* **Step 4.3 \- AI Hookup:** Add the `POST /api/v1/game/ai-turn` endpoint to allow the backend to query the trained `.pt` model when it is an opponent's turn.

#### **4\. Copilot Prompting Instructions**

To execute this plan with GitHub Copilot Chat, highlight a specific phase or step in this document and use targeted prompts, such as:

> *@workspace Review Phase 1, Step 1.1 in plan.md and the VC\_Game\_Rules.md file. Generate the code for engine/models.py.*

