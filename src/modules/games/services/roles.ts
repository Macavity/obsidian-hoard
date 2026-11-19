import type { Game, GamesSettings, GamesData } from '../domain/model';

export interface GameReader {
	getGame(id: string): Game | undefined;
	getGames(): Game[];
}

export interface GameWriter {
	updateGame(input: Game): Promise<void>;
}

export interface GameSettingsAccess {
	getSettings(): GamesSettings;
	updateSettings(patch: Partial<GamesSettings>): Promise<void>;
}

export interface GameSnapshot {
	exportSnapshot(): GamesData;
	restore(data: GamesData): Promise<void>;
}
