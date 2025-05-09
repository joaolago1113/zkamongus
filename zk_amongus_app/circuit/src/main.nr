
use zk_amongus::{GameState, UserState, MoveData, MoveHashes, PlayerPublicInfo, PlayerPrivateInfo, move};
use zk_amongus::{NUM_PLAYERS, MAX_VISIBLE_SECTIONS, ROLE_CREW, ROLE_IMPOSTER, STATUS_ALIVE, STATUS_DEAD};
use zk_amongus::{empty_game_state, initialize_user_state, commit_to_user_secrets};
fn main(
    input_state: GameState,  
    user_state: UserState, 
    move_data: MoveData,    
) -> pub (GameState, MoveHashes) { 

    let r = move(input_state, user_state, move_data);

    r
}

#[test]
fn test_app_move() {
    let mut game_state = empty_game_state();

    let p0_encrypt_secret = 101;
    let p0_mask_secret = 102;

    game_state = commit_to_user_secrets(
        game_state, 
        p0_encrypt_secret, 
        p0_mask_secret, 
        0 // Player index 0
    );
    
    let p0_user_state = initialize_user_state(0, p0_encrypt_secret, p0_mask_secret);

    let move_data = MoveData { target_section: 27 };

    let initial_hash = game_state.hash();
    let initial_turn_count = game_state.turn_count;

    let (new_game_state, move_hashes) = main(
        game_state, 
        p0_user_state, 
        move_data
    );

    assert_eq(initial_hash, move_hashes.input_game_state_hash);
    assert_eq(new_game_state.hash(), move_hashes.output_game_state_hash);

    assert(initial_hash != move_hashes.output_game_state_hash);

    assert_eq(new_game_state.turn_count, initial_turn_count + 1);

    assert_eq(new_game_state.all_players_public[p0_user_state.my_player_index].section_id, move_data.target_section);

    // assert(move_hashes.input_user_state_hash != move_hashes.output_user_state_hash); 

    println("[TEST] test_app_move completed successfully.");
}
