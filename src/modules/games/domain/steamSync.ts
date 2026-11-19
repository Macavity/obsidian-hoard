/**
 * One game's Steam sync results, for GameDataManager.applySteamSync. `achievements`
 * is null when the game has none or syncing was off — either way the stored counts
 * are left untouched rather than zeroed.
 */
export interface SteamSyncUpdate {
	gameId: string;
	steamAppId: string;
	playtimeMinutes: number;
	lastPlayed: string | null;
	achievements: { earned: number; total: number } | null;
}
