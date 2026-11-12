> **Status: exploratory, deferred.** The MVP uses heuristic bots behind the `Bot` interface in `src/bots/types.ts`, which receives only a `PlayerView` plus the legal moves, so a learned policy can plug in later. The reward values and rules below are unvalidated proposals; see [plan.md](./plan.md).

Project: VC Card Game & RL AI  
Purpose: Define the mathematical boundaries, state representations, and reward functions for the Stable-Baselines3 PPO training environment.

1. State Representation (The Observation Space)  
2. To train the AI, the game state must be translated into an array of numbers (a tensor). The AI will "see" the following at the start of its turn:

Current Hand: A 52-element binary array (1 \= card in hand, 0 \= not in hand).  
Current Table State: A 52-element binary array representing the active cards currently waiting to be beaten.  
Opponent Hand Sizes: Three integers representing how many cards Opponent 1, Opponent 2, and Opponent 3 have left.  
Pass Status: Three binary values (1 or 0\) indicating which opponents have already passed in the current round.

1. The Action Space & Action Masking

Action Space: A discrete list of every legally possible combination in the game (Single 3♠, Pair of 4s, 3-card sequence of 5-6-7, etc.), plus one action for "Pass".  
Action Masking (Crucial Strategy): Instead of letting the AI guess randomly and punishing it for breaking the rules, the Python environment will use an Action Mask. Before the AI guesses, the engine calculates a boolean mask of only the currently legal moves (e.g., if a Pair of 5s is on the table, singles are masked out). The AI is forced to select only from valid actions. This drastically reduces training time.

1. The Reward Function (How the AI Learns)  
2. The AI updates its neural network based on a points system. The goal is to maximize points.

Winning the Game (First Place): \+100 points for being the first to play all 13 cards.  
Card Remaining Penalty: \-2 points for every card left in hand when an opponent wins. This teaches the AI to dump as many cards as possible even if it knows it won't get 1st place.  
The "Rotten 2" Penalty: \-15 points for every "2" left in hand when an opponent wins. This teaches the AI not to hoard its most powerful cards until it's too late.  
Bombing a 2 (Slam Reward): \+20 points for successfully dropping a Bomb/Slam on an opponent's 2\. This encourages the AI to recognize and execute this specific strategic maneuver.  
Passing Penalty: \-1 point for passing. A very tiny penalty that discourages the AI from passing lazily if it actually has a valid, strategic card it could play.  
