import type { ApiService } from './ApiService';
import type { HoardPluginSettings } from './types';

export type MediaSource = 'cinemeta' | 'omdb' | 'tmdb';
export type BookSource = 'openlibrary' | 'google';
export type GameSource = 'steam' | 'rawg' | 'igdb';

export type KeyProbe = Pick<
	ApiService,
	'hasOmdbKey' | 'hasTmdbKey' | 'hasGoogleBooksKey' | 'hasRawgKey' | 'hasIgdbCredentials'
>;

/** Chosen source if keyless or its key is set, else the keyless one. */
export function effectiveMediaSource(
	settings: Pick<HoardPluginSettings, 'activeApi'>,
	api: Pick<KeyProbe, 'hasOmdbKey' | 'hasTmdbKey'>,
): MediaSource {
	if (settings.activeApi === 'OMDb' && api.hasOmdbKey()) return 'omdb';
	if (settings.activeApi === 'TMDB' && api.hasTmdbKey()) return 'tmdb';
	return 'cinemeta';
}

export function effectiveBookSource(settings: Pick<HoardPluginSettings, 'booksApiSource'>, api: Pick<KeyProbe, 'hasGoogleBooksKey'>): BookSource {
	return settings.booksApiSource === 'google' && api.hasGoogleBooksKey() ? 'google' : 'openlibrary';
}

export function effectiveGameSource(settings: Pick<HoardPluginSettings, 'gamesApiSource'>, api: Pick<KeyProbe, 'hasRawgKey' | 'hasIgdbCredentials'>): GameSource {
	if (settings.gamesApiSource === 'rawg' && api.hasRawgKey()) return 'rawg';
	if (settings.gamesApiSource === 'igdb' && api.hasIgdbCredentials()) return 'igdb';
	return 'steam';
}
