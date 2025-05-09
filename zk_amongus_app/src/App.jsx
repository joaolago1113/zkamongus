import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import {
  initGame,
  move,
  consumeStateUpdate,
  getVisibleSections,
  canSeeItem,
  canSeePlayer,
  performKill,
  castVote,
} from "./prover.js";
import { temporaryUserSecrets } from "./secrets.js";
import {
  NUM_PLAYERS,
  MAX_VISIBLE_SECTIONS,
  ROLE_CREW,
  ROLE_IMPOSTER,
  STATUS_ALIVE,
  STATUS_DEAD,
  MAP_SIZE,
  MAP_SECTIONS,
  CENTER_SECTION,
  CREW_COUNT,
  IMPOSTER_COUNT,
  TOTAL_PLAYERS,
  PLAYER_TYPES
} from "./constants.js";


function Game() {
  const [gameState, setGameState] = useState(null);
  const [userStates, setUserStates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [items, setItems] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [visibleSectionsUI, setVisibleSectionsUI] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winCondition, setWinCondition] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("");
  const [currentGameStateHash, setCurrentGameStateHash] = useState(null);

  // Initialize game state
  useEffect(() => {
    initializeGame();
  }, []);

  const initializeGame = async () => {
    try {
      setProcessing(true);
      setMessage("Initializing game state...");
      
      // Initialize ZK game state and user states using prover
      const initResult = await initGame(temporaryUserSecrets);

      if (!initResult || !initResult.gameState || initResult.userStates.length !== NUM_PLAYERS) {
          throw new Error("Failed to initialize Noir states.");
      }

      setGameState(initResult.gameState);
      setUserStates(initResult.userStates);
      
      // Initialize simplified JS players for UI based on initial Noir state
      const newPlayers = initResult.gameState.all_players_public.map((p, index) => ({
        id: index, // Use index as ID for simplicity
        type: p.role === ROLE_IMPOSTER ? PLAYER_TYPES.IMPOSTER : PLAYER_TYPES.CREW,
        section: parseInt(p.section_id), // Use initial section from Noir state
        color: getRandomColor(index),
        name: `${p.role === ROLE_IMPOSTER ? 'Imposter' : 'Crew'} ${index + 1}`,
        status: parseInt(p.status) // Use initial status
      }));
      setPlayers(newPlayers);
      
      // Initialize UI items (same as before, but check against player start sections)
      const playerStartSections = new Set(newPlayers.map(p => p.section));
      const newItems = [];
      const possibleSections = Array.from({length: MAP_SECTIONS}, (_, i) => i)
        .filter(i => !playerStartSections.has(i)); // Avoid placing items where players start
      
      for (let i = 0; i < 10; i++) {
        if (possibleSections.length === 0) break; // Stop if no valid sections left
        const randomIndex = Math.floor(Math.random() * possibleSections.length);
        const sectionId = possibleSections.splice(randomIndex, 1)[0];
        newItems.push({ id: i, section: sectionId, collected: false });
      }
      setItems(newItems);
      
      // Set initial UI visibility for the first player (Player 0)
      updateVisibilityUI(0, initResult.userStates[0]);
      
      setProcessing(false);
      setMessage("Game started. Player 1's turn.");
    } catch (error) {
      console.error("Failed to initialize game:", error);
      setMessage("Error initializing game. Please reload the page.");
      setProcessing(false);
    }
  };

  // Generate random color for players
  const getRandomColor = (seed) => {
    const colors = [
      '#e74c3c', // Red
      '#3498db', // Blue
      '#2ecc71', // Green
      '#f1c40f', // Yellow
      '#9b59b6', // Purple
      '#e67e22', // Orange
      '#1abc9c', // Teal
      '#95a5a6'  // Gray
    ];
    // Use seed to ensure consistent colors
    return colors[seed % colors.length];
  };

  // Handle moving to a new section (with ZK proof generation)
  const moveToSection = async (targetSectionId) => {
    const currentPlayerUserState = userStates[currentPlayerIndex];
    // const currentSectionId = parseInt(currentPlayerUserState?.all_players_public_view[currentPlayerIndex]?.section_id ?? '-1'); // Not currently used

    // Basic UI checks
    if (processing || gameOver || !currentPlayerUserState || players[currentPlayerIndex]?.status !== parseInt(STATUS_ALIVE)) { // Ensure STATUS_ALIVE comparison is correct
        console.log("Move prevented:", { processing, gameOver, currentUserState: !!currentPlayerUserState, status: players[currentPlayerIndex]?.status });
      return;
    }
    
    // --- Visibility Check (Seems okay, uses local JS state) ---
    // Convert hex strings from Noir state to numbers for comparison
    const visibleSectionsAsNumbers = currentPlayerUserState?.visible_sections?.map(hexStr => parseInt(hexStr))?.filter(n => !isNaN(n)) || []; // Added filter for NaN
    const isVisible = visibleSectionsAsNumbers.includes(targetSectionId); // Compare number to number

    if (!isVisible) {
        setMessage("Cannot move to an unseen section.");
      return;
    }
    // --- END Visibility Check ---
    
    try {
      setProcessing(true);
      setMessage(`Player ${currentPlayerIndex + 1} moving to section ${targetSectionId}. Generating proof...`);
      
      // Call the prover's move function (which uses noir.execute)
      const moveResult = await move(
          gameState,            // Pass the current global Noir GameState
          currentPlayerUserState, // Pass the current player's Noir UserState
          targetSectionId,      // Target section ID
          currentPlayerIndex    // Current player's index
      );

      // Check the NEW expected return structure
      if (!moveResult || !moveResult.proof || !moveResult.rawPublicInputs || !moveResult.parsedPublicOutputs?.newGameState) {
          // Added check for rawPublicInputs and parsedPublicOutputs.newGameState
          throw new Error("Proof generation or parsing public outputs failed.");
      }

      // Extract the verified new global state from the proof's public outputs
      const newGameState = moveResult.parsedPublicOutputs.newGameState;
      const moveHashes = moveResult.parsedPublicOutputs.moveHashes; // <-- Extract moveHashes

      // --- Hash Check (like in chess app) ---
      if (currentGameStateHash !== null) { // Skip check for the very first move
        if (currentGameStateHash !== moveHashes.input_game_state_hash) {
          // Log error but potentially continue? Or throw?
          console.error(
            "CRITICAL HASH MISMATCH: Current hash does not match proof's input hash!",
            {
              currentHash: currentGameStateHash,
              proofInputHash: moveHashes.input_game_state_hash
            }
          );
          // Decide how to handle this - maybe set an error message and stop?
          setMessage("Error: Game state hash mismatch! State may be inconsistent.");
          setProcessing(false);
          return; // Stop processing the move
        } else {
          console.log("Input game state hash verified successfully.");
        }
      }
      // --- End Hash Check ---

      // --- Optimistic UI Update (Update player position based on NEW game state) ---
      setPlayers(prevPlayers => {
          const updatedPlayers = [...prevPlayers];
          // Ensure the section is updated correctly based on type from the new GameState
          updatedPlayers[currentPlayerIndex].section = parseInt(newGameState.all_players_public[currentPlayerIndex].section_id);
          // Also update status optimistically if needed (though move doesn't change it here)
          updatedPlayers[currentPlayerIndex].status = parseInt(newGameState.all_players_public[currentPlayerIndex].status);
          return updatedPlayers;
      });
      // Defer UI visibility update until after state consumption
      // ---------------------------

      // --- State Update Logic (using results from proof) ---

      // 1. Consume the state update for ALL players (including self)
      //    This updates their local UserState view based on the verified new global state.
      console.log("Consuming verified state update for all players...");
      const consumptionPromises = [];
      const updatedUserStatesArray = [...userStates]; // Create a mutable array copy

      for (let i = 0; i < NUM_PLAYERS; i++) {
        consumptionPromises.push(
            consumeStateUpdate(
              moveResult.proof,           // Pass raw proof bytes
              moveResult.rawPublicInputs,   // Pass raw public inputs
              userStates[i],              // Pass the player's *current* UserState
              newGameState                // Pass the *verified new* global GameState
            ).then(result => {
                if (result && result.verified && result.updatedUserState) {
                    updatedUserStatesArray[i] = result.updatedUserState; // Update the array entry
                } else {
                    console.warn(`State update consumption failed or verification failed for player ${i}`);
                    // Keep the old state if consumption fails
                    // updatedUserStatesArray[i] remains userStates[i]
                }
            }).catch(error => {
                console.error(`Error consuming state update for player ${i}:`, error);
                 // Keep the old state on error
            })
        );
      }

      // Wait for all consumption calls to finish
      await Promise.allSettled(consumptionPromises);
      console.log("All state consumptions finished.");

      // 2. Set the new global GameState (from proof outputs) and updated UserStates array
      setGameState(newGameState);              // Update global state with the verified one
      setUserStates(updatedUserStatesArray);   // Update all user states after consumption
      setCurrentGameStateHash(moveHashes.output_game_state_hash); // <-- Store the NEW hash

      // 3. Update UI visibility for the current player using the *newly consumed* state
      updateVisibilityUI(currentPlayerIndex, updatedUserStatesArray[currentPlayerIndex]);
      // --- End State Update Logic ---
      
      // Check for item collection (remains the same)
      const currentPlayer = players[currentPlayerIndex]; // Get potentially updated player info
      if (currentPlayer && currentPlayer.type === PLAYER_TYPES.CREW) {
        checkItemCollection(targetSectionId);
      }
      
      setMessage(`Player ${currentPlayerIndex + 1} moved. Proof generated and verified.`);
      setProcessing(false);
      
      // Advance to next player's turn (remains the same)
      setTimeout(() => {
        nextTurn();
      }, 500);
      
    } catch (error) {
      console.error("Error during move:", error);
      setMessage("Error moving player. Please check console and try again.");
      setProcessing(false);
      // TODO: Revert optimistic UI update if necessary
    }
  };

  // Update UI visibility based on the current player's UserState
  const updateVisibilityUI = (playerId, currentUserState) => {
      if (!currentUserState) {
          console.warn("Cannot update UI visibility, UserState is missing for player", playerId);
          setVisibleSectionsUI([]);
          return;
      }
      // Extract visible sections (they are strings in UserState) and convert to numbers for UI
      const visibleNoirSections = currentUserState.visible_sections
          .map(s => parseInt(s)) // Convert string Fields/u32s to numbers
          .filter(s => s < MAP_SECTIONS); // Filter out sentinel values
      setVisibleSectionsUI(visibleNoirSections);
  };

  // Check if player has collected an item
  const checkItemCollection = (sectionId) => {
    const itemIndex = items.findIndex(item => 
      item.section === sectionId && !item.collected
    );
    
    if (itemIndex !== -1) {
      // Collect the item
      const newCollectedItems = items.filter(item => item.section !== sectionId);
      setItems(newCollectedItems);
      
      // Check win condition for crew (all items collected)
      if (newCollectedItems.length === items.length) {
        setGameOver(true);
        setWinCondition(PLAYER_TYPES.CREW);
      }
    }
  };

  // Process imposter kill attempt with ZK proof
  const attemptKill = async (targetPlayerId) => {
    if (processing || gameOver) return;
    
    const currentPlayer = players[currentPlayerIndex];
    const targetPlayer = players[targetPlayerId];
    
    // Validate kill conditions
    if (currentPlayer.type !== PLAYER_TYPES.IMPOSTER || 
        targetPlayer.type === PLAYER_TYPES.IMPOSTER) {
      return;
    }
    
    try {
      setProcessing(true);
      setMessage("Generating zero-knowledge proof for elimination...");
      
      // Generate ZK proof for the kill
      const result = await performKill(
        currentPlayer.section,
        targetPlayer.section,
        gameState,
        currentPlayerIndex
      );
      
      // Update killed players (Optimistic UI Update)
      const newKilledPlayers = players.filter(p => p.id === targetPlayerId).map(p => ({ ...p, status: parseInt(STATUS_ALIVE) }));
      setPlayers(prevPlayers => {
        const updatedPlayers = [...prevPlayers];
        updatedPlayers[targetPlayerId] = newKilledPlayers[0];
        return updatedPlayers;
      });
      
      // --- Refactored State Update Logic for Kill ---
      // 1. Create a deep copy
      const newGameState = JSON.parse(JSON.stringify(gameState));
      
      // 2. Extract updated public game state
      const updatedPublicGameState = result.publicInputs[0];

      // 3. Update current player's state (optional for kill, depends on proof output)
      // Assuming kill proof might return an updated user state (e.g., cooldown timer)
      // newGameState.playerStates[currentPlayerIndex].userState = result.userState; 
      // newGameState.playerStates[currentPlayerIndex].oldUserState = result.userState;

      // 4. Update shared gameState reference for ALL players
      newGameState.gameState = updatedPublicGameState;
      for (let i = 0; i < NUM_PLAYERS; i++) {
        newGameState.playerStates[i].gameState = updatedPublicGameState;
      }

      // 5. Consume the kill proof for all *other* players (if necessary)
      // Depending on the game logic, other players might need to update their state 
      // based on the public info revealed by the kill proof (e.g., seeing the body)
      // This requires a consumeKill or similar function in prover.js and the circuit.
      // For now, we skip this consumption step as it wasn't explicitly defined.
      /*
      for (let i = 0; i < NUM_PLAYERS; i++) {
        if (i !== currentPlayerIndex) {
          const updatedConsumedUserState = await prover.consumeKill(
            result.proof,
            result.publicInputs,
            newGameState.playerStates[i].userState,
            i.toString()
          );
          newGameState.playerStates[i].userState = updatedConsumedUserState;
        }
      }
      */

      // 6. Track game state hash history
      const outputGameStateHash = result.publicInputs[1]?.output_game_state;
      if (outputGameStateHash) {
          newGameState.gameStateHashes.push(outputGameStateHash);
      }
      // Track user state hash if kill updates it
      // const outputUserStateHash = result.publicInputs[1]?.output_user_state;
      // if (outputUserStateHash && newGameState.playerStates[currentPlayerIndex]) { ... }

      // 7. Set the final updated state
      setGameState(newGameState);
      // --- End Refactored State Update Logic for Kill ---
      
      // Check win condition for imposters
      const aliveImposters = players.filter(p => 
        p.type === PLAYER_TYPES.IMPOSTER && p.status === parseInt(STATUS_ALIVE)
      ).length;
      
      const aliveCrew = players.filter(p => 
        p.type === PLAYER_TYPES.CREW && p.status === parseInt(STATUS_ALIVE)
      ).length;
      
      if (aliveImposters >= aliveCrew) {
        setGameOver(true);
        setWinCondition(PLAYER_TYPES.IMPOSTER);
      }
      
      setMessage("");
      setProcessing(false);
      
      // After processing kill, advance to next player's turn
      setTimeout(() => {
        nextTurn();
      }, 500);
    } catch (error) {
      console.error("Error performing kill:", error);
      setMessage("Error generating proof for elimination. Try again.");
      setProcessing(false);
    }
  };

  // Advance to the next player's turn
  const nextTurn = () => {
    // Find the next alive player
    let nextPlayerIndex = (currentPlayerIndex + 1) % NUM_PLAYERS;
    while (players[nextPlayerIndex]?.status !== parseInt(STATUS_ALIVE)) {
      nextPlayerIndex = (nextPlayerIndex + 1) % NUM_PLAYERS;
    }
    
    // Update current round and visibility for next player
    setCurrentPlayerIndex(nextPlayerIndex);
    updateVisibilityUI(nextPlayerIndex, userStates[nextPlayerIndex]);
  };

  // Handle section clicking
  const handleSectionClick = (sectionId) => {
    // If the section is visible, move to it
    if (visibleSectionsUI.includes(sectionId)) {
      moveToSection(sectionId);
    }
  };

  // Toggle help overlay
  const toggleHelp = () => {
    setShowHelp(!showHelp);
  };

  // AI movement for simulation
  const moveAIPlayers = (allPlayers) => {
    // In a real game, this would be controlled by other players
    // For this demo, we're just showing placeholder logic
  };

  // Update player circle layout calculation to accommodate larger players
  const renderSection = (sectionId) => {
    const isVisible = visibleSectionsUI.includes(sectionId);
    const isBase = sectionId === CENTER_SECTION;
    
    // Only show items in visible sections for crew members
    const currentPlayer = players[currentPlayerIndex];
    const hasVisibleItem = isVisible && items.some(item => 
      item.section === sectionId && 
      !item.collected
    );
    
    // Only show players in visible sections
    const visiblePlayers = players.filter(p => 
      p.section === sectionId && 
      p.status === parseInt(STATUS_ALIVE) &&
      (isVisible || p.id === currentPlayerIndex) // Always show current player
    );

    return (
      <div 
        key={sectionId}
        className={`game-section 
          ${isVisible ? 'visible' : 'hidden'} 
          ${currentPlayer?.section === sectionId ? 'current' : ''} 
          ${isBase ? 'base' : ''}`}
        onClick={() => isVisible && moveToSection(sectionId)}
      >
        <div className="section-id">{sectionId}</div>
        
        {isBase && <div className="base-label">BASE</div>}
        
        {hasVisibleItem && (
          <div className="item" title="Collect this item">🔴</div>
        )}
        
        {visiblePlayers.length > 0 && (
          <div className={`players-container ${visiblePlayers.length === 1 ? 'single-player' : ''}`}>
          {visiblePlayers.map((player, index) => {
              // Position players in a circle if multiple players
              let xPos = 0;
              let yPos = 0;
              
              if (visiblePlayers.length === 1) {
                // Center the single player
                xPos = 0;
                yPos = 0;
              } else if (visiblePlayers.length <= 5) {
                // Arrange in a simple circle for up to 5 players
                const radius = 25; // Larger radius for bigger players
                const angle = (Math.PI * 2 * index) / visiblePlayers.length;
                xPos = Math.cos(angle) * radius;
                yPos = Math.sin(angle) * radius;
              } else {
                // For more players, use two concentric circles
                const innerPlayers = Math.min(4, Math.floor(visiblePlayers.length / 2));
                const outerPlayers = visiblePlayers.length - innerPlayers;
                
                if (index < innerPlayers) {
                  // Inner circle
                  const radius = 18;
                  const innerAngle = (Math.PI * 2 * index) / innerPlayers;
                  xPos = Math.cos(innerAngle) * radius;
                  yPos = Math.sin(innerAngle) * radius;
                } else {
                  // Outer circle
                  const radius = 45; // Larger radius for better separation
                  const outerAngle = (Math.PI * 2 * (index - innerPlayers)) / outerPlayers;
                  xPos = Math.cos(outerAngle) * radius;
                  yPos = Math.sin(outerAngle) * radius;
                }
              }
              
              // Highlight current player
              const isCurrentPlayer = player.id === currentPlayerIndex;
              
              return (
                <div
                  key={player.id}
                  className={`player ${isCurrentPlayer ? 'current-player' : ''} ${player.type === PLAYER_TYPES.IMPOSTER ? 'imposter' : ''}`}
                  style={{
                    backgroundColor: player.color,
                    transform: `translate(${xPos}px, ${yPos}px)`,
                    zIndex: isCurrentPlayer ? 10 : 1,
                  }}
                  onClick={(e) => {
                    // Allow imposters to kill crew by clicking on them
                    if (currentPlayer?.type === PLAYER_TYPES.IMPOSTER && 
                        player.type === PLAYER_TYPES.CREW &&
                        currentPlayer.id === currentPlayerIndex) {
                      e.stopPropagation();
                      attemptKill(player.id);
                    }
                  }}
                  title={player.name}
                >
                  {player.hasItem && <div className="player-item">🔴</div>}
                </div>
              );
            })}
          </div>
        )}
        
        {!isVisible && (
          <div className="fog">❓</div>
        )}
      </div>
    );
  };

  // Game over screen
  const renderGameOver = () => (
    <div className="game-over">
      <h2>{winCondition === PLAYER_TYPES.CREW ? 'Crew Wins!' : 'Imposters Win!'}</h2>
      <div className="message">
        {winCondition === PLAYER_TYPES.CREW 
          ? 'All items collected successfully!' 
          : 'Imposters have eliminated enough crew members!'}
      </div>
      <div className="stats">
        <div>Items Collected: {items.length}/{items.length}</div>
        <div>Crew Eliminated: {players.filter(p => p.type === PLAYER_TYPES.CREW && p.status === parseInt(STATUS_ALIVE)).length}/{players.filter(p => p.type === PLAYER_TYPES.CREW).length}</div>
      </div>
      <button className="restart-button" onClick={initializeGame}>Play Again</button>
    </div>
  );

  // Help modal
  const renderHelpModal = () => (
    <div className="help-overlay" onClick={toggleHelp}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <h2>How to Play</h2>
        <p>Welcome to ZK Among Us, a social deduction game with zero-knowledge proofs!</p>
        <ul>
          <li><strong>Crew Members:</strong> Collect all items to win. You can only see sections adjacent to your position.</li>
          <li><strong>Imposters:</strong> Eliminate crew members by moving to the adjacent section and clicking on them.</li>
          <li><strong>Movement:</strong> Click on visible sections to move. Each move generates a ZK proof.</li>
          <li><strong>Vote:</strong> After collecting all items, vote to eliminate an imposter. A majority vote wins, and a new round starts.</li>
          <li><strong>Rounds:</strong> There are 3 rounds. The imposters win if they eliminate the crew in 2 rounds, and the crew wins if they collect all items in 3 rounds.</li>
        </ul>
        <p>Zero-knowledge proofs keep information hidden while verifying actions are valid!</p>
        <button onClick={toggleHelp}>Close</button>
      </div>
    </div>
  );

  // Loading screen
  if (!gameState || !players.length) {
    return (
      <div className="loading">
        <h2>Loading Game...</h2>
        <p>Initializing zero-knowledge proofs...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>ZK Among Us</h1>
        <p>A zero-knowledge proof implementation of a social deduction game</p>
      </header>
      
      <div className="game-container">
        <div className="game-header">
          <div className="turn-info">
          {players[currentPlayerIndex] && (
            <>
              <div className="player-indicator" style={{ backgroundColor: players[currentPlayerIndex].color }}></div>
              <span>{players[currentPlayerIndex].name}'s Turn</span>
              <span className="role-indicator">
                ({players[currentPlayerIndex].type === PLAYER_TYPES.CREW ? 'CREW' : 'IMPOSTER'})
              </span>
            </>
          )}
          </div>
          <button className="help-button" onClick={toggleHelp}>Help</button>
        </div>
        
        <div className="message-bar">{message}</div>
        
        <div className="game-board">
          <div className="map-container">
            {Array.from({ length: MAP_SECTIONS }).map((_, i) => renderSection(i))}
          </div>
          
          <div className="game-stats">
            <div className="stat-row">
              <span>Items Collected:</span>
              <span>{items.length}/{items.length}</span>
            </div>
            <div className="stat-row">
              <span>Players Alive:</span>
              <span>{players.filter(p => p.status === parseInt(STATUS_ALIVE)).length}/{players.length}</span>
            </div>
            <div className="player-list">
              {players.map(player => (
                <div 
                  key={player.id}
                  className={`player-status ${player.status !== parseInt(STATUS_ALIVE) ? 'dead' : ''} ${player.id === currentPlayerIndex ? 'current' : ''}`}
                >
                  <div className="color-indicator" style={{ backgroundColor: player.color }}></div>
                  <span>{player.name}</span>
                  {player.status !== parseInt(STATUS_ALIVE) && <span className="dead-label">DEAD</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {processing && (
          <div className="processing-overlay">
            <div className="processing-message">
              Generating ZK Proof...
            </div>
          </div>
        )}
        
        {gameOver && renderGameOver()}
        
        {showHelp && renderHelpModal()}
      </div>
    </div>
  );
}

function App() {
  return <Game />;
}

export default App;
