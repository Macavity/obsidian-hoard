import type { HoardPluginSettings } from '../types';

/** Games settings group chip: the active provider and whether its credentials are filled in. */
export function gamesKeyChip(
	s: Pick<HoardPluginSettings, 'gamesApiSource' | 'rawgApiKey' | 'igdbClientId' | 'igdbClientSecret'>,
): { text: string; tone: 'ok' | 'warn' } {
	const rawg = (s.gamesApiSource ?? 'rawg') === 'rawg';
	const name = rawg ? 'RAWG' : 'IGDB';
	const keyed = rawg ? !!s.rawgApiKey : !!(s.igdbClientId && s.igdbClientSecret);
	return keyed ? { text: `${name} · key set`, tone: 'ok' } : { text: `${name} · key needed`, tone: 'warn' };
}
