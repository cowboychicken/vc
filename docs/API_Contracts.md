> **Status: not used by the MVP.** The game runs entirely in the browser, so there is no client/server boundary yet. Revisit this document only if a backend is added (for example for login or saved stats). Its rules assumptions are out of date; see [VC_Game_Rules.md](./VC_Game_Rules.md).

Project: VC Card Game & RL AI  
Purpose: Define the strict REST API endpoints and JSON payloads for communication between the frontend UI and the FastAPI local server.

1. Global Data Structures  
2. To ensure the frontend and backend speak the exact same language, all cards are passed as standardized JSON objects.

Card Object: {"suit": "spades", "rank": 3, "value": 3} (Values map from 3 up to 15 for the 2).  
Combination Types: single, pair, triple, sequence, four\_of\_a\_kind, pair\_sequence.

1. Initialize a New Game

Endpoint: POST /api/v1/game/start  
Description: Shuffles the deck, deals 13 cards to 4 players, and determines who has the 3♠ to start.  
Request Body: Empty {}  
Response Body (Game State):  
JSON  
{  
"game\_id": "1234-5678",  
"status": "in\_progress",  
"active\_player\_id": "player\_1",  
"table": {  
"current\_combination": ,  
"combination\_type": null  
},  
"player\_hand":   
{"suit": "spades", "rank": 3, "value": 3},  
{"suit": "hearts", "rank": 10, "value": 10}  
,  
"opponents": {  
"bot\_1": {"cards\_remaining": 13, "has\_passed": false},  
"bot\_2": {"cards\_remaining": 13, "has\_passed": false},  
"bot\_3": {"cards\_remaining": 13, "has\_passed": false}  
},  
"valid\_moves": \[  
{"suit": "spades", "rank": 3, "value": 3}  
\]  
}  
Note: The backend calculates valid\_moves so the frontend simply renders those options as clickable, preventing illegal plays on the client side.

1. Player Plays Cards

Endpoint: POST /api/v1/game/play  
Description: The human player submits a selected combination to the table.  
Request Body:  
JSON  
{  
"game\_id": "1234-5678",  
"player\_id": "player\_1",  
"cards\_played":   
{"suit": "spades", "rank": 3, "value": 3},  
{"suit": "hearts", "rank": 3, "value": 3}

}  
Response Body: Returns the updated Game State object (same structure as above), advancing active\_player\_id to the next player.

1. Player Passes

Endpoint: POST /api/v1/game/pass  
Description: The human player chooses to pass, locking them out of the current round.  
Request Body:  
JSON  
{  
"game\_id": "1234-5678",  
"player\_id": "player\_1"  
}  
Response Body: Returns the updated Game State object. has\_passed for player\_1 becomes true.

1. Trigger AI Turn

Endpoint: POST /api/v1/game/ai-turn  
Description: Tells the backend to feed the current game state into the .pt / .onnx AI model, calculate the bot's move, execute it, and return the result.  
Request Body:  
JSON  
{  
"game\_id": "1234-5678",  
"bot\_id": "bot\_1"  
}  
Response Body:  
JSON  
{  
"action\_taken": "play",  
"cards\_played":   
{"suit": "diamonds", "rank": 5, "value": 5},  
{"suit": "clubs", "rank": 5, "value": 5}  
,  
"game\_state": { ... }  
}  
