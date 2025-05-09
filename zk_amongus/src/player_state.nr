use dep::std;



pub global NUM_PLAYERS: u32 = 3;




pub global MAP_SIZE: u32 = 8;
pub global MAX_VISIBLE_SECTIONS: u32 = 9;

pub global ROLE_CREW: u32 = 0;
pub global ROLE_IMPOSTER: u32 = 1;

pub global STATUS_ALIVE: u32 = 0;
pub global STATUS_DEAD: u32 = 1;

pub struct PlayerPublicInfo {
    pub player_id: Field,       
    pub game_player_index: u32, 
    pub status: u32,            
    pub section_id: u32,         
}

impl std::default::Default for PlayerPublicInfo {
    fn default() -> Self {
        PlayerPublicInfo {
            player_id: 0,
            game_player_index: NUM_PLAYERS, 
            status: STATUS_ALIVE, 
            section_id: MAP_SIZE * MAP_SIZE, 
        }
    }
}

pub struct PlayerPrivateInfo {
    pub role: u32,        
    pub encrypt_secret: Field,
    pub mask_secret: Field,  
    pub voted_for_index: u32,
}

impl std::default::Default for PlayerPrivateInfo {
    fn default() -> Self {
        PlayerPrivateInfo {
            role: ROLE_CREW,
            encrypt_secret: 0,
            mask_secret: 0,
            voted_for_index: NUM_PLAYERS, 
        }
    }
}

pub struct UserState {
     pub my_player_index: u32, 
    pub private_info: PlayerPrivateInfo,
     pub all_players_public_view: [PlayerPublicInfo; NUM_PLAYERS], 
    pub visible_sections: [u32; MAX_VISIBLE_SECTIONS], 
}

impl std::default::Default for UserState {
    fn default() -> Self {
        let invalid_section_sentinel: u32 = MAP_SIZE * MAP_SIZE; 
        let default_visible = [invalid_section_sentinel; MAX_VISIBLE_SECTIONS]; 
        UserState {
             my_player_index: NUM_PLAYERS,
            private_info: PlayerPrivateInfo::default(),
             all_players_public_view: [PlayerPublicInfo::default(); NUM_PLAYERS],
            visible_sections: default_visible,
        }
    }
}
