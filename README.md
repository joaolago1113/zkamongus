# ZK Among Us

![image](https://github.com/user-attachments/assets/3f3b3a85-7e21-4874-bcc7-e11803beb019)

## What is ZK Among Us?

ZK Among Us is a social deduction game that brings the thrill of Among Us into the world of zero-knowledge proofs. Players navigate a map, complete tasks (or pretend to!), and try to identify the imposter(s) among them, all while their critical information is cryptographically secured.

## How to Run the Project

1.  Navigate to the `zk_amongus_app` directory in your terminal.
2.  Run the command:
    ```bash
    bun i && bun dev
    ```
3.  This will install the necessary dependencies and automatically open the game in your web browser.

## How It Works

The game simulates a multiplayer environment where each player controls their character.

*   **Fog of War via mpclib**: The fog‑of‑war mechanic that restricts what each player can see is enforced with secure multiparty computation using [mpclib](https://github.com/zac-williamson/mpclib). This guarantees that clients cannot access information beyond their permitted view while preserving game integrity.
*   **Character & Visibility**: Your character is a representation of an Among Us crewmate/imposter. You have limited visibility and can only see adjacent sections on the map, including diagonals (e.g., if you are at (x, y), you can see (x+1, y), (x-1, y), (x, y+1), (x, y-1), (x+1, y+1), (x+1, y-1), (x-1, y+1), and (x-1, y-1)).
*   **Movement**: You can move your character by clicking on any of the visible adjacent sections.
*   **Objective (Crew Members)**: The primary goal for crew members is to collect all the items scattered around the map and then return to a designated base area to initiate a vote.
*   **Objective (Imposters)**: Imposters aim to eliminate crew members while pretending to complete tasks. They can move to an adjacent section occupied by a crewmate and click on them to "kill" them.
*   **Player Count**: This version of the game is designed for 5 players.

## Game Rules

*   **Welcome to ZK Among Us**: A social deduction game enhanced with zero-knowledge proofs!
*   **Crew Members**: Collect all items scattered across the map to win. Remember, you can only see sections directly adjacent to your current position.
*   **Imposters**: Your goal is to eliminate crew members. To do this, move to an adjacent section occupied by a crew member and click on them.
*   **Movement**: Click on any visible (adjacent) section to move your character. Each move is designed to be backed by a ZK proof, ensuring fair play.
*   **Vote**: Once all items have been collected by the crew, a voting phase begins. Players vote to eliminate who they suspect is an imposter. A majority vote successfully ejects a player. A new round then starts.
*   **Rounds**: The game consists of 3 rounds.
    *   Imposters win if they successfully eliminate the required number of crew members within 2 rounds.
    *   Crew members win if they successfully collect all items and vote out imposters, surviving through 3 rounds.
*   **Zero-Knowledge Proofs**: The core of the game leverages ZK proofs to keep sensitive information hidden (like player roles or specific item locations for others) while cryptographically verifying that all actions taken are valid according to the game's rules.

## Current Implementation Status

### What is Implemented:

*   **Visibility**: Players have limited visibility, restricted to adjacent and diagonal squares.
*   **Movement**: Players can move to any visible square.
*   **Multiplayer Simulation**: The game supports 5 players.

### What is NOT Yet Implemented:

*   **Random Item Placement**: Items are not yet randomly placed around the map using the `mpclib` shuffle functionality.
*   **Random Imposter Assignment**: The imposter role is not yet randomly and secretly assigned using a shuffle mechanism.
*   **Hidden Voting**: The ability for players to cast their votes privately, with the results revealed without exposing individual votes (leveraging ZK proofs )

