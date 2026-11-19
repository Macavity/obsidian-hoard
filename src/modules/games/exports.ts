export { GAME_AUTO_STATUS, GAME_FINISHED_STATUS, GAME_TBA_STATUS, defaultGamesSettings } from './domain/gameDefaults';
export { newGame } from './domain/newGame';
export type { Game, GamesSettings, GamesSavedFilterPreset, GameGroup, GamesData, OpenSteamSync } from './domain/model';
export type { GameReader, GameWriter, GameSettingsAccess, GameSnapshot } from './services/roles';
