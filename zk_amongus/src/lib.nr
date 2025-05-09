use dep::std;
use std::hash::poseidon2::Poseidon2;

// Use specific imports from mpclib
use mpclib::selective_disclosure::selective_disclosure::{
    consume_round_commitments, create_round_commitments, RoundState, UserOutputState,
};

// Declare core modules for Among Us game
mod player_state;
mod validate_move;
mod update_vision;
// mod api; // Comment out if moving logic directly here

// Re-export necessary items for use within the crate (e.g., in api.nr) or potentially externally
// Ensure items being re-exported are marked `pub` in their respective modules
pub use player_state::{ PlayerPublicInfo, PlayerPrivateInfo };
pub use player_state::{ MAP_SIZE, NUM_PLAYERS, MAX_VISIBLE_SECTIONS }; 
pub use player_state::{ ROLE_CREW, ROLE_IMPOSTER, STATUS_ALIVE, STATUS_DEAD }; // Re-export constants
pub use validate_move::validate_adjacent_move;
pub use update_vision::calculate_visible_sections;

// Keep API re-export separate if preferred
// pub use api::{*}; // Removed wildcard export - access via api::function_name

// Placeholder example function (remove or move later)
// fn example_move_proof(...) -> UserState { ... }

// NOTE: Old chess-specific code, structs (GameState, MoveHashes, etc.) 
// and functions (move, consume_opponent_move_and_update_game_state, commit_to_user_secrets)
// defined directly in the old lib.nr have been removed.
// Their equivalents should be defined within the `api` module, 
// using the new structs and functions from player_state, validate_move, update_vision.

// --- Core Types (Mirrors fog_of_war_chess structure) ---

type RoundMpcState = RoundState<64, NUM_PLAYERS>;
pub struct GameState {
    pub game_ended: bool, // Or maybe an enum: Ongoing, CrewWin, ImposterWin
    pub turn_count: u32, 
    // Store the public state of all players
    pub all_players_public: [PlayerPublicInfo; NUM_PLAYERS],
    // Add other global state: e.g., emergency meeting status, task progress?
    pub mpc_state: RoundMpcState, // Re-add MPC state
}

impl std::default::Default for GameState {
    fn default() -> Self {
        let mut players = [PlayerPublicInfo::default(); NUM_PLAYERS];
        for i in 0..NUM_PLAYERS {
            players[i].game_player_index = i;
            // Role assignment removed - Roles are private now
            // Actual roles will be determined during initialization (e.g., via shuffle or predetermined secret)
            players[i].section_id = 36; // Example start section
            players[i].status = STATUS_ALIVE; 
            players[i].player_id = i as Field; 
        }
        GameState { 
            game_ended: false, 
            turn_count: 0, 
            all_players_public: players,
            mpc_state: RoundMpcState::default() 
        }
    }
}

// Add commit_to_user_secrets based on user example
impl GameState {
    // Use mpc_state.hash() as confirmed from mpclib source
    pub fn hash(self) -> Field {
        self.mpc_state.hash() 
    }

    // #[export] // Cannot export from impl block
    // Internal logic for committing secrets
    fn commit_secrets_logic(
        mut self, 
        encrypt_secret: Field,
        mask_secret: Field,
        player_index: u32,
    ) -> GameState {
        let encrypt_buffer = [encrypt_secret];
        let encrypt_hash = Poseidon2::hash(encrypt_buffer, 1);
        let mask_buffer = [mask_secret];
        let mask_hash = Poseidon2::hash(mask_buffer, 1);
        self.mpc_state.user_encrypt_secret_hashes[player_index] = encrypt_hash;
        self.mpc_state.user_mask_secret_hashes[player_index] = mask_hash;
        self 
    }
}

// Standalone exported function to commit secrets (mirrors internal logic)
#[export]
pub fn commit_to_user_secrets(
    game_state: GameState, 
    encrypt_secret: Field,
    mask_secret: Field,
    player_index: u32,
) -> GameState {
    // Call the internal logic
    game_state.commit_secrets_logic(encrypt_secret, mask_secret, player_index)
}

// Adapted MoveData for Among Us
pub struct MoveData {
    pub target_section: u32,
}

// Adapted UserState for Among Us (uses internal modules)
pub struct UserState {
     pub my_player_index: u32, 
     pub private_info: PlayerPrivateInfo, // Now includes role
     pub encrypt_secret: Field, // Add secret for MPC
     pub mask_secret: Field,    // Add secret for MPC
     // Player's view of the public state (might differ from global GameState due to visibility)
     pub all_players_public_view: [PlayerPublicInfo; NUM_PLAYERS], 
     pub visible_sections: [u32; MAX_VISIBLE_SECTIONS], 
     // Maybe add: pub task_list: ..., pub kill_cooldown: ...
}

// Default UserState needs careful initialization based on player index
impl std::default::Default for UserState {
     fn default() -> Self {
         // Default state is somewhat meaningless without a player index context
         // initialize_user_state function is better.
         let invalid_section_sentinel: u32 = MAP_SIZE * MAP_SIZE; 
         let default_visible = [invalid_section_sentinel; MAX_VISIBLE_SECTIONS]; 
         UserState {
             my_player_index: NUM_PLAYERS, // Sentinel for invalid/default
             private_info: PlayerPrivateInfo::default(),
             encrypt_secret: 0, // Default secret (should be replaced)
             mask_secret: 0,    // Default secret (should be replaced)
             all_players_public_view: [PlayerPublicInfo::default(); NUM_PLAYERS],
             visible_sections: default_visible,
         }
     }
}

// Add an encode method to UserState
impl UserState {
    // Encodes the player's view of everyone's public state (section and status)
    // into a [Field; 64] buffer for commitment.
    // Player i's section_id maps to index 2*i
    // Player i's status maps to index 2*i + 1
    // Pass self by value as workaround for ownership flag issue
    pub fn encode_state_for_commitment(self) -> [Field; 64] {
        let mut encoded = [0; 64];
        // Ensure we don't write past the buffer if NUM_PLAYERS > 32
        let max_players_to_encode = if NUM_PLAYERS * 2 > 64 { 32 } else { NUM_PLAYERS };

        for i in 0..max_players_to_encode {
            // Encode section_id for player i at index 2*i
            encoded[2 * i] = self.all_players_public_view[i].section_id as Field;
            // Encode status for player i at index 2*i + 1
            encoded[2 * i + 1] = self.all_players_public_view[i].status as Field;
            // Role is private and not encoded here.
            // Player ID is implicitly known by index.
        }
        // Indices from max_players_to_encode*2 up to 63 remain 0.
        encoded
    }
}

// Adapted MoveHashes
pub struct MoveHashes {
    pub input_game_state_hash: Field, // Hash of GameState before move
    pub input_user_state_hash: Field, // Hash of UserState before move
    pub output_game_state_hash: Field, // Hash of GameState after move
    pub output_user_state_hash: Field, // Hash of UserState after move
}

impl std::default::Default for MoveHashes {
    fn default() -> Self {
        MoveHashes {
            input_game_state_hash: 0,
            input_user_state_hash: 0,
            output_game_state_hash: 0,
            output_user_state_hash: 0,
        }
    }
}

// --- Core Functions (Mirrors fog_of_war_chess structure) ---

// Public move function: takes current state, user state, move data, and player index
// Returns the new global state and relevant hashes
#[export]
pub fn move(
    input_state: GameState,    // Changed: Removed 'mut', renamed to input_state
    user_state: UserState,
    move_data: MoveData
) -> (GameState, MoveHashes) { // Return type remains the same

    let player_index = user_state.my_player_index;
    // Calculate input hashes
    let input_game_state_hash = input_state.hash();
    // Placeholder for user state hash calculation
    let input_user_state_buffer = [user_state.private_info.encrypt_secret, user_state.private_info.mask_secret];
    let input_user_state_hash = Poseidon2::hash(input_user_state_buffer, 2);

    // 1. Assertions and Pre-conditions
    assert_eq(input_state.game_ended, false, "Game already ended");
    //assert_eq(user_state.my_player_index, player_index, "UserState does not match player_index");
    // Ensure the player making the move is alive in their own view
    let my_public_info_view = user_state.all_players_public_view[player_index];
    assert(my_public_info_view.status == STATUS_ALIVE, "Cannot move when dead"); // Check against constant

    // 2. Validate Move Legality (using internal module)
    let current_section = my_public_info_view.section_id;
    let target_section = move_data.target_section;
    let is_valid = validate_adjacent_move(current_section, target_section, MAP_SIZE); // Re-use validation
    assert(is_valid, "Invalid move: Target section not adjacent"); // Assert the result

    // 3. Calculate *Intended* Next Player State (for commitment)
    // This calculates what the user_state *would* look like after the move,
    // primarily for determining visibility for the commitment mask.
    // It does NOT modify the input user_state.
    let mut intended_next_user_state = user_state; // Start with current state
    intended_next_user_state.all_players_public_view[player_index].section_id = target_section; // Update position
    intended_next_user_state.visible_sections = calculate_visible_sections(target_section, MAP_SIZE); // Update vision

    // 4. Prepare MPC Commitment Data
    // Encode the player's *intended* view of the public state after the move
    let encoded_state_to_commit: [Field; 64] = intended_next_user_state.encode_state_for_commitment();

    // Create visibility mask based on the *intended* post-move state
    let mut visibility_fields: [Field; 64] = [0; 64]; // 0 = hide, 1 = reveal
    for i in 0..NUM_PLAYERS { // Iterate through all players (global indices)
        let opponent_global_index = i;
        let opponent_section = intended_next_user_state.all_players_public_view[opponent_global_index].section_id;
        let mut opponent_is_visible = false;
        for j in 0..MAX_VISIBLE_SECTIONS {
            if intended_next_user_state.visible_sections[j] == opponent_section {
                opponent_is_visible = true;
            }
        }

        // If the opponent is visible *or* if it's the player themselves, mark their fields revealable
        if opponent_is_visible | (opponent_global_index == player_index) {
             // Mark section_id (index 2*i) and status (index 2*i + 1) as revealable
            visibility_fields[2 * opponent_global_index] = 1;
            visibility_fields[2 * opponent_global_index + 1] = 1;
        }
    }
    // Ensure player always reveals their own info
    if player_index < NUM_PLAYERS { // Basic bounds check
        visibility_fields[2 * player_index] = 1;     // Reveal own section
        visibility_fields[2 * player_index + 1] = 1; // Reveal own status
    }

    // 5. Create MPC Commitments
    let mut output_commitments: UserOutputState<64, NUM_PLAYERS> = create_round_commitments(
        encoded_state_to_commit,
        visibility_fields,
        user_state.private_info.encrypt_secret, // Use secrets from the *input* user_state
        user_state.private_info.mask_secret,
        input_state.mpc_state, // Pass the *immutable* input mpc_state
        player_index
    );

    // 6. Calculate the next MPC state using the input state's mpc_state
    let mut output_mpc_state = input_state.mpc_state;
    //.update2(output_commitments, player_index);

    output_mpc_state.round_number += 1;
    output_mpc_state.previous_output_states[player_index] = output_commitments;

    // 7. Create the output GameState
    // Create a mutable copy of the public player info to update it
    let mut updated_all_players_public = input_state.all_players_public;
    updated_all_players_public[player_index].section_id = target_section;

    let output_game_state = GameState {
        all_players_public: updated_all_players_public, // Use the updated copy
        game_ended: input_state.game_ended, // For now, assume move doesn't end game
        mpc_state: output_mpc_state,        // Use the newly calculated MPC state
        turn_count: input_state.turn_count + 1, // Increment turn count
    };

    // 8. Calculate Output Hashes
    let output_game_state_hash = output_game_state.hash();
    // User state hash should reflect the state *before* consumption,
    // which is encoded in `encoded_state_to_commit`.
    let output_user_state_hash = Poseidon2::hash(encoded_state_to_commit, encoded_state_to_commit.len());

    // 9. Return updated global state and hashes
    let move_hashes = MoveHashes {
        input_game_state_hash: input_game_state_hash,
        input_user_state_hash: input_user_state_hash, // Hash of input user state secrets
        output_game_state_hash: output_game_state_hash, // Hash of the new game state
        output_user_state_hash: output_user_state_hash, // Hash of the committed user view
    };

    (output_game_state, move_hashes)
}

// Initializer for GameState
#[export]
pub fn empty_game_state() -> GameState {
     GameState::default() // IMPLICIT return
}

// Initializer for UserState
#[export]
pub fn initialize_user_state(player_index: u32, encrypt_secret: Field, mask_secret: Field) -> UserState {
    let my_role = if player_index < 2 { ROLE_IMPOSTER } else { ROLE_CREW };
    let initial_global_state = GameState::default();
    let my_start_section = initial_global_state.all_players_public[player_index].section_id;
    let initial_visible_sections = calculate_visible_sections(my_start_section, MAP_SIZE);
    let mut initial_view = [PlayerPublicInfo::default(); NUM_PLAYERS];
    
    for i in 0..NUM_PLAYERS {
        let other_player_global_info = initial_global_state.all_players_public[i];
        let other_player_section = other_player_global_info.section_id;
        let mut player_can_be_seen = false; 
        for j in 0..MAX_VISIBLE_SECTIONS {
             if initial_visible_sections[j] == other_player_section {
                 player_can_be_seen = true;
             }
        }

        if i == player_index {
            initial_view[i] = other_player_global_info;
        } else { 
            if player_can_be_seen {
                 initial_view[i] = other_player_global_info;
            } else {
                let mut masked_info = PlayerPublicInfo::default();
                masked_info.game_player_index = i; 
                masked_info.section_id = MAP_SIZE * MAP_SIZE; 
                masked_info.status = other_player_global_info.status; 
                initial_view[i] = masked_info; 
            }
        }
    }

    let user_state = UserState {
        my_player_index: player_index,
        private_info: PlayerPrivateInfo { 
            role: my_role, 
            encrypt_secret: encrypt_secret, 
            mask_secret: mask_secret, 
            voted_for_index: NUM_PLAYERS 
        },
        encrypt_secret: encrypt_secret, 
        mask_secret: mask_secret,
        all_players_public_view: initial_view, 
        visible_sections: initial_visible_sections,
    };
    
     user_state 
}

// Function to update a player's local UserState based on the global GameState's MPC commitments
#[export]
pub fn consume_global_state_and_update_local_view(
    current_local_user_state: UserState, 
    global_game_state: GameState,      
) -> UserState {                        

    let my_player_index = current_local_user_state.my_player_index;

    // --- Consume Commitments --- 
    let revealed_state_data_nested: [[Option<Field>; 64]; NUM_PLAYERS - 1] = consume_round_commitments(
        current_local_user_state.mask_secret, 
        global_game_state.mpc_state,             
        my_player_index 
    );

    // --- Update View --- 
    let mut updated_user_state = current_local_user_state;
    
    // Keep track of which opponent index maps to which nested array index
    let mut opponent_array_index = 0; 

    for opponent_global_index in 0..NUM_PLAYERS {
        if opponent_global_index != my_player_index {
            // Get the revealed Option<Field> array for this specific opponent
            let revealed_opponent_options: [Option<Field>; 64] = revealed_state_data_nested[opponent_array_index];
            
            // Get a mutable reference to our current view of this opponent
            let mut current_opponent_view = updated_user_state.all_players_public_view[opponent_global_index];

            // Decode revealed section_id (encoded at index 2 * opponent_global_index)
            let section_index = 2 * opponent_global_index;
            if section_index < 64 { // Bounds check
                if revealed_opponent_options[section_index].is_some() {
                    // Revealed: Update section_id in our view
                    current_opponent_view.section_id = revealed_opponent_options[section_index].unwrap_unchecked() as u32;
                } // else: Not revealed, keep existing section_id view (potentially masked/stale)
            }

            // Decode status (encoded at index 2 * opponent_global_index + 1)
            let status_index = section_index + 1;
            if status_index < 64 { // Bounds check
                if revealed_opponent_options[status_index].is_some() {
                    // Revealed: Update status in our view
                    current_opponent_view.status = revealed_opponent_options[status_index].unwrap_unchecked() as u32;
                } // else: Not revealed, keep existing status view (potentially masked/stale)
            }

            // NOTE: Other fields (indices not 2*i or 2*i+1) were not encoded in the first place,
            // so we don't need to decode them.

            // --- Update the main view array with the potentially updated opponent view ---
            updated_user_state.all_players_public_view[opponent_global_index] = current_opponent_view;
            
            // Increment index for the revealed_state_data_nested array
            opponent_array_index += 1;
        }
    }

    // --- Update Our Own Public View Info ---
    // Ensure our own view reflects the latest public global state for ourselves,
    // as our state isn't revealed via consume_round_commitments.
    updated_user_state.all_players_public_view[my_player_index] = global_game_state.all_players_public[my_player_index];

    // --- Recalculate Visibility --- 
    let my_updated_section = updated_user_state.all_players_public_view[my_player_index].section_id;
    updated_user_state.visible_sections = calculate_visible_sections(my_updated_section, MAP_SIZE);

    // --- Optional: Re-masking based on new visibility (can be complex) ---
    // This logic might be needed if players can move *out* of view and their info should be hidden again.
    // For now, we rely on the initial decoding providing the correct visible state.

    // --- Return Updated State --- 
    updated_user_state 
}
