export const NUM_PLAYERS = 3;
export const MAX_VISIBLE_SECTIONS = 5; 
export const ROLE_CREW = "0";
export const ROLE_IMPOSTER = "1";
export const STATUS_ALIVE = "0";
export const STATUS_DEAD = "1";

export const MAP_SIZE = 8;
export const MAP_SECTIONS = MAP_SIZE * MAP_SIZE;
export const CENTER_SECTION = Math.floor(MAP_SIZE / 2) * MAP_SIZE + Math.floor(MAP_SIZE / 2); 
export const CREW_COUNT = 5;
export const IMPOSTER_COUNT = 2;
export const TOTAL_PLAYERS = CREW_COUNT + IMPOSTER_COUNT;
export const PLAYER_TYPES = {
  CREW: 'crew',
  IMPOSTER: 'imposter'
}; 

