import { defined } from '../../../shared/domain/sharedHelpers';
import type { Game } from './model';

const isoNow = (): string => new Date().toISOString();

export type NewGame = Pick<Game, 'id' | 'title' | 'type' | 'status'> & Partial<Game>;

export function newGame(fields: NewGame, now = isoNow()): Game {
	const { id, title, type, status, ...rest } = fields;
	return {
		id,
		title,
		type,
		status,
		developer: '',
		publisher: '',
		priority: '',
		favorite: false,
		wishlist: false,
		rating: 0,
		progress: 0,
		playtimeMinutes: 0,
		achievementsEarned: 0,
		achievementsTotal: 0,
		platforms: [],
		singleplayer: false,
		coop: false,
		multiplayer: false,
		coverUrl: '',
		apiSource: '',
		apiId: '',
		steamAppId: '',
		lastPlayed: null,
		storeUrl: '',
		externalLink: '',
		vaultPage: '',
		releaseDate: null,
		dateStarted: null,
		dateFinished: null,
		dateAdded: now,
		dateModified: now,
		...defined(rest),
	};
}
