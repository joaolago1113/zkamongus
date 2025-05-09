use crate::player_state::{MAP_SIZE, MAX_VISIBLE_SECTIONS, NUM_PLAYERS};
use dep::std;

// Calculates the set of visible sections for a player based on simple adjacency.
// Includes the player's own section.
// Returns an array of size MAX_VISIBLE_SECTIONS, padded with invalid_section_sentinel for invalid/out-of-bounds sections.
pub fn calculate_visible_sections(
    player_section: u32, 
    map_size: u32
) -> [u32; MAX_VISIBLE_SECTIONS] {
    
    let invalid_section_sentinel: u32 = map_size * map_size; // Use same sentinel as default
    let mut visible_sections = [invalid_section_sentinel; MAX_VISIBLE_SECTIONS];
    let mut visible_count: u32 = 0; 

    let player_x: u32 = player_section % map_size;
    let player_y: u32 = player_section / map_size;

    // Iterate through the 3x3 grid centered on the player
    for y_offset_idx in 0..3 { // y_offset = -1, 0, 1 maps to index 0, 1, 2
        for x_offset_idx in 0..3 { // x_offset = -1, 0, 1 maps to index 0, 1, 2
            let y_offset: i64 = (y_offset_idx as i64) - 1;
            let x_offset: i64 = (x_offset_idx as i64) - 1;

            let current_x_signed: i64 = (player_x as i64) + x_offset;
            let current_y_signed: i64 = (player_y as i64) + y_offset;

            // Boundary checks
            if current_x_signed >= 0 & current_x_signed < (map_size as i64) & 
               current_y_signed >= 0 & current_y_signed < (map_size as i64) 
            {
                // Convert back to u32 if within bounds
                let current_x = current_x_signed as u32;
                let current_y = current_y_signed as u32;
                let section_id = current_y * map_size + current_x;
                
                // Add to visible sections if there's space
                if visible_count < MAX_VISIBLE_SECTIONS {
                    visible_sections[visible_count] = section_id;
                    visible_count = visible_count + 1;
                }
            }
        }
    }

    visible_sections
}

// Test case (replace old ones)
#[test]
fn test_visibility_center() {
    let map_s: u32 = 8;
    let invalid_sentinel: u32 = map_s * map_s;
    // Center section for 8x8 is 27 (3,3) or 36 (4,4). Let's use 36.
    let center_section: u32 = (map_s / 2) * map_s + (map_s / 2);
    let visible = calculate_visible_sections(center_section, map_s);
    
    // Expected sections for center (4,4) are: 27, 28, 29, 35, 36, 37, 43, 44, 45
    let expected = [27, 28, 29, 35, 36, 37, 43, 44, 45];
    let mut count = 0;
    for i in 0..MAX_VISIBLE_SECTIONS {
        if visible[i] != invalid_sentinel { // Use sentinel for check
            let mut found = false;
            for j in 0..expected.len() {
                if visible[i] == expected[j] {
                    found = true;
                }
            }
            // Check after inner loop completes
            assert(found, "Visible section not in expected list");
            count += 1;
        }
    }
    assert(count == expected.len(), "Incorrect number of visible sections");
}

#[test]
fn test_visibility_corner() {
    let map_s: u32 = 8;
    let invalid_sentinel: u32 = map_s * map_s;
    let corner_section: u32 = 0; // Top-left corner (0,0)
    let visible = calculate_visible_sections(corner_section, map_s);
    
    // Expected sections for corner (0,0) are: 0, 1, 8, 9
    let expected = [0, 1, 8, 9];
    let mut count = 0;
    let mut sorted_visible = [invalid_sentinel; MAX_VISIBLE_SECTIONS]; // Use sentinel
    let mut k: u32 = 0; // Ensure k is u32

    // Collect valid visible sections
    for i in 0..MAX_VISIBLE_SECTIONS {
         if visible[i] != invalid_sentinel { // Use sentinel
             assert(k < MAX_VISIBLE_SECTIONS, "Exceeded visible section buffer"); // Safety check
             sorted_visible[k] = visible[i];
             k += 1;
         }
    }
     // Basic check for count and presence
     assert(k == (expected.len() as u32), "Incorrect number of visible sections for corner");
     for i in 0..expected.len() {
         let mut found = false;
         for j in 0..k {
             if sorted_visible[j] == expected[i] {
                 found = true;
             }
         }
         // Check after inner loop completes
         assert(found, "Expected corner section not found");
     }
}

// Remove old chess vision functions and tests
// pub(crate) fn update_vision(...) { ... }
// fn update_vision_for_pawn(...) { ... }
// #[test] fn test_piece_data() { ... }
