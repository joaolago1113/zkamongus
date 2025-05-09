use dep::std;

// Import constants
use crate::player_state::{MAP_SIZE};

// Validates if a move between two sections is adjacent (including diagonals)
// or the same, and within the map boundaries.
// Returns true if valid, otherwise asserts internally.
// Make pub so it can be re-exported
pub fn validate_adjacent_move(
    from_section: u32, 
    to_section: u32, 
    map_size: u32 // Pass map_size explicitly for flexibility
) -> bool {
    
    let is_same_section = from_section == to_section;

    // Calculate coordinates
    let from_x = from_section % map_size;
    let from_y = from_section / map_size; // Integer division
    let to_x = to_section % map_size;
    let to_y = to_section / map_size;

    // Check boundaries for destination (only if not the same section, though asserting always is fine)
    assert(to_x < map_size, "Move destination X out of bounds");
    assert(to_y < map_size, "Move destination Y out of bounds");

    // Calculate signed differences
    let dx_signed: i64 = (to_x as i64) - (from_x as i64);
    let dy_signed: i64 = (to_y as i64) - (from_y as i64);

    // Check if the move distance is at most 1 in each direction (allows adjacent + diagonal)
    let is_dx_valid = (dx_signed >= -1) & (dx_signed <= 1);
    let is_dy_valid = (dy_signed >= -1) & (dy_signed <= 1);
    let is_adjacent = is_dx_valid & is_dy_valid; 

    // The move is valid if it's to the same section OR an adjacent one.
    let is_valid_move = is_same_section | is_adjacent;

    assert(is_valid_move, "Move target is not the same or an adjacent section");

    // Return the boolean result (useful if called from unconstrained context maybe)
    is_valid_move 
}

// Remove old chess validation functions
// pub(crate) fn validate_move_and_update_board_state(...) { ... }
// fn get_piece_at_unsafe(...) { ... }
// fn is_square_attacked(...) { ... }
// ... etc ...
