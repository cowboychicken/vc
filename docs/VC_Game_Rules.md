Project: VC Card Game & RL AI  
Purpose: Strict logical definition of game rules, valid plays, and win conditions for the Python game engine.

1. Deck & Dealing

Deck: Standard 52-card deck. Jokers removed.  
Players: 4 players.  
Dealing: 13 cards dealt to each player.

1. Card Hierarchy (Rank & Suit)

Rank Order (Lowest to Highest): 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2\. (The 3 is the absolute lowest rank; the 2 is the absolute highest).  
Suit Order (Lowest to Highest): Spades (♠) \< Clubs (♣) \< Diamonds (♦) \< Hearts (♥).  
Tie-Breaking: When comparing single cards or combinations of the exact same rank, the highest single card in the combination determines the winner. (e.g., A Pair of 5♥ and 5♠ beats a Pair of 5♦ and 5♣ because Hearts \> Diamonds).

1. Valid Standard Combinations

Single Card: Any individual card.  
Pair: Two cards of the exact same rank (e.g., 8♣ 8♥).  
Triple: Three cards of the exact same rank (e.g., 9♠ 9♦ 9♥).  
Sequence (Run): Three or more cards of consecutive numeric rank (e.g., 4♠ 5♥ 6♣).  
Constraint 1: No "wrap-around" sequences allowed (e.g., Q-K-A-2-3 is INVALID).  
Constraint 2: 2s are strictly forbidden in standard sequences (e.g., J-Q-K-A-2 is INVALID).

1. Bombs & Slams (Special Combinations)  
2. Bombs/Slams are special combinations designed specifically to beat 2s, but they can also beat other Bombs.

Definitions:  
Four-of-a-Kind: Four cards of the same rank.  
Sequence of Pairs: Three or more consecutive pairs (e.g., 3♠3♥, 4♣4♦, 5♥5♠).  
The "Beats Anything" Rule: A Bomb/Slam can be played out of turn to beat a single 2, a pair of 2s, or a triple of 2s.  
Bomb vs. Bomb Rule: Any Bomb/Slam can beat a lower Bomb/Slam. A higher Four-of-a-Kind beats a lower Four-of-a-Kind. A sequence of 4 pairs beats a sequence of 3 pairs.

1. Game Flow & Turn Logic

The Lead (First Game): The player holding the 3♠ always plays first. Their opening play must include the 3♠ (either as a single, in a pair, or in a sequence).  
The Lead (Subsequent Games): The winner of the previous game plays first and may lead with any valid combination.  
Following: A player must beat the active combination on the table with the exact same combination type (e.g., a 4-card sequence must be beaten by a higher 4-card sequence), except when playing a Bomb on a 2\.  
Passing: If a player cannot or chooses not to beat the current play, they pass. Once a player passes, they are locked out of the current round until the table is cleared.  
Clearing the Table: If all other players pass, the last player to play a card wins the round, clears the table, and leads the next round.

1. Win Conditions

Standard Win: The first player to successfully discard all 13 cards wins the game.  
Instant Win (Auto-Win): If a player is dealt all four 2s in their initial 13-card hand, the game ends immediately, and that player is declared the automatic winner before any cards are played.  
