import { UltraHonkBackend } from "@aztec/bb.js";

import { Noir } from '@noir-lang/noir_js';
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js"; 
import acvm from '@noir-lang/acvm_js/web/acvm_js_bg.wasm?url';
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
const initPromises = [
    initACVM(fetch(acvm)).catch(e => console.warn("ACVM init failed/already initialized:", e)),
    initNoirC(fetch(noirc)).catch(e => console.warn("NoirC init failed/already initialized:", e))
];
await Promise.allSettled(initPromises);


import {
    empty_game_state, initialize_user_state, consume_global_state_and_update_local_view, 
    commit_to_user_secrets 
} from '../codegen/index.ts';

import { 
    NUM_PLAYERS, 
    MAX_VISIBLE_SECTIONS,
    ROLE_CREW,
    ROLE_IMPOSTER,
    STATUS_ALIVE,
    STATUS_DEAD
} from './constants.js';

let circuit;
let backend;
let noir;
try {
    circuit = await import("../circuit/target/circuit.json");
    backend = new UltraHonkBackend(circuit.bytecode, {
        threads: navigator.hardwareConcurrency,
    });
    noir = new Noir(circuit);
      } catch (e) {
    console.error("Failed to load circuit or initialize Noir/Backend:", e);
}


const MAP_SIZE = 8;
const INVALID_SECTION_SENTINEL = (MAP_SIZE * MAP_SIZE).toString();


export function getVisibleSections(playerSection, mapSize = MAP_SIZE) {
  const row = Math.floor(playerSection / mapSize);
  const col = playerSection % mapSize;
  
  const visibleSections = [playerSection];
  
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      if (r === 0 && c === 0) continue; 
      
      const newRow = row + r;
      const newCol = col + c;
      
      if (newRow >= 0 && newRow < mapSize && newCol >= 0 && newCol < mapSize) {
        const sectionId = newRow * mapSize + newCol;
        visibleSections.push(sectionId);
      }
    }
  }
  
  return visibleSections;
}

export function canSeeItem(playerSection, itemSection) {
  const visibleSections = getVisibleSections(playerSection);
  return visibleSections.includes(itemSection);
}

export function canSeePlayer(playerSection, otherPlayerSection) {
  const visibleSections = getVisibleSections(playerSection);
  return visibleSections.includes(otherPlayerSection);
}

export async function initGame(playerSecrets) {
    console.log("Initializing game state via Noir codegen with provided secrets...");
    if (!empty_game_state || !initialize_user_state || !commit_to_user_secrets) {
        console.error("Codegen functions not loaded yet.");
        return { gameState: null, userStates: [] };
    }
    if (!playerSecrets || playerSecrets.length !== NUM_PLAYERS) {
        console.error(`Invalid secrets array provided. Expected ${NUM_PLAYERS} entries.`);
        return { gameState: null, userStates: [] };
    }

    try {
        const initialGameState = await empty_game_state();
        console.log("Initial GameState from Noir:", initialGameState);

        const userStates = [];
        let currentGameState = initialGameState; 
        for (let i = 0; i < NUM_PLAYERS; i++) {
            const { encryptSecret, maskSecret } = playerSecrets[i];
            if (!encryptSecret || !maskSecret) {
                console.error(`Missing secrets for player ${i}`);
                throw new Error(`Missing secrets for player ${i}`);
            }

            console.log(`Committing secrets for player ${i}...`);
            currentGameState = await commit_to_user_secrets(
                currentGameState,
                encryptSecret,
                maskSecret,
                i.toString()
            );

            console.log(`Initializing UserState for player ${i}...`);
            const userState = await initialize_user_state(i.toString(), encryptSecret, maskSecret);
            console.log(`Initial UserState for player ${i} from Noir:`, userState);
            userStates.push(userState);
        }

        return { gameState: currentGameState, userStates: userStates };
    } catch (e) {
        console.error("Error initializing game via Noir codegen:", e);
        return { gameState: null, userStates: [] };
    }
}

export async function move(currentGameState, currentUserState, targetSection, playerIndex) {
    console.log(`Generating proof for player ${playerIndex} move to ${targetSection}...`);
    if (!noir || !backend) {
        console.error("Noir or Backend not initialized.");
        return null;
    }
    const start = performance.now();

    const inputs = {
        input_state: currentGameState, 
        user_state: currentUserState, 
        move_data: { target_section: targetSection.toString() }, 
    };

    let witnessBytes; 
    let returnValue;
    try {
        console.log("Executing circuit with inputs:", JSON.stringify(inputs, null, 2));
        console.log("Executing circuit...", inputs);
        const executionResult = await noir.execute(inputs);
        witnessBytes = executionResult.witness; 
        returnValue = executionResult.returnValue;
        console.log("Witness object type:", typeof witnessBytes);
        console.log("Witness object value (Uint8Array):", witnessBytes);
        console.log("Circuit execution successful. Return value (raw):", returnValue);
    } catch (error) {
        console.error("Error executing circuit:", error);
        console.error("Inputs:", inputs);
        return null;
    }
    const witnessGenTime = performance.now() - start;
    console.log(`Witness Generation Time: ${witnessGenTime.toFixed(2)}ms`);

    let proof;
    const proofStart = performance.now();
    try {
        console.log("Generating proof...");
        proof = await backend.generateProof(witnessBytes, {
            keccak: true,
        });
        console.log("Proof generation successful.");
    } catch (error) {
        console.error("Error generating proof:", error);
        return null;
    }
    const proofGenTime = performance.now() - proofStart;
    console.log(`Proof Generation Time: ${proofGenTime.toFixed(2)}ms`);

    if (!returnValue || !Array.isArray(returnValue) || returnValue.length !== 2) {
        console.error("Unexpected return value structure from circuit execution:", returnValue);
        return null;
    }

    const publicOutputs = {
        newGameState: returnValue[0], 
        moveHashes: returnValue[1]    
    };
    console.log("[Move Debug] Parsed Public Outputs:", publicOutputs);

    const rawPublicInputs = proof.publicInputs;
    console.log("[Move Debug] Raw Public Inputs for Verification:", rawPublicInputs);
  
  const totalTime = performance.now() - start;
    console.log(`Total Move Proof Time: ${totalTime.toFixed(2)}ms`);

  return {
        proof: proof.proof,        
        rawPublicInputs: rawPublicInputs,
        parsedPublicOutputs: publicOutputs
    }; 
}

export async function consumeStateUpdate(
    proofBytes,      
    rawPublicInputs,
    currentUserState,
    latestGlobalGameState
) {

    console.log("Verifying proof and updating local state based on latest global state...");
     if (!consume_global_state_and_update_local_view || !backend) {
        console.error("Codegen function consume_global_state_and_update_local_view or Backend not loaded.");
        return { verified: false, updatedUserState: currentUserState }; 
    }
    const start = performance.now();

    let verified = false;
    
    try {
        console.log("Verifying proof...");
        const proofData = proofBytes instanceof Uint8Array ? proofBytes : new Uint8Array(proofBytes);

        verified = await backend.verifyProof({ proof: proofData, publicInputs: rawPublicInputs }, {
            keccak: true,
        });
        const verificationTime = performance.now() - start;
        console.log(`Proof verification time: ${verificationTime.toFixed(2)}ms. Verified: ${verified}`);

    } catch (error) {
        console.error("Error during proof verification:", error);
        verified = false; 
    }

    if (verified) {
        try {
            console.log("Proof verified. Calling consume_global_state_and_update_local_view...");
            const updatedUserState = await consume_global_state_and_update_local_view(
                currentUserState,
                latestGlobalGameState 
            );
            console.log("Local UserState updated after consuming global state.");
            const totalTime = performance.now() - start;
            console.log(`Consume State Update Time (incl. verification): ${totalTime.toFixed(2)}ms`);
            return { verified: true, updatedUserState: updatedUserState };
        } catch (error) {
            console.error("Error consuming global state update after verification:", error);
            return { verified: true, updatedUserState: currentUserState }; 
        }
    } else {
        console.warn("Proof verification failed. Local state not updated.");
        const totalTime = performance.now() - start;
        console.log(`Consume State Update Time (verification failed): ${totalTime.toFixed(2)}ms`);
        return { verified: false, updatedUserState: currentUserState };
    }
}

export async function performKill(imposterSection, crewSection, gameState, imposterPlayerId) {
    console.warn("performKill simulation called - requires Noir implementation and codegen export.");
    const updatedGameState = JSON.parse(JSON.stringify(gameState));
    const crewIndex = updatedGameState.all_players_public.findIndex(p => p.section_id == crewSection && p.status == 0); 
    if (crewIndex !== -1) {
        updatedGameState.all_players_public[crewIndex].status = 1; 
        console.log(`Simulated kill: Player ${crewIndex} at section ${crewSection} killed by player ${imposterPlayerId}`);
    } else {
        console.log("Simulated kill: No alive crewmate found at target section.");
    }
    return { updatedGameState }; 
}

export async function castVote(fromPlayerId, votedPlayerId, gameState) {
    console.warn("castVote simulation called - requires Noir implementation and codegen export.");
    const updatedGameState = JSON.parse(JSON.stringify(gameState));
    console.log(`Simulated vote: Player ${fromPlayerId} voted for Player ${votedPlayerId}`);
    return { updatedGameState }; 
}
