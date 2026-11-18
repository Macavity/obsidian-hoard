import { t } from '../i18n';
import type { HoardPluginSettings } from '../types';

/** Games settings group chip for a keyed provider: whether its credentials are filled in. */
export function gamesKeyChip(
	source: 'rawg' | 'igdb',
	s: Pick<HoardPluginSettings, 'rawgApiKey' | 'igdbClientId' | 'igdbClientSecret'>,
): { text: string; tone: 'ok' | 'warn' } {
	const rawg = source === 'rawg';
	const name = rawg ? 'RAWG' : 'IGDB';
	const keyed = rawg ? !!s.rawgApiKey : !!(s.igdbClientId && s.igdbClientSecret);
	return keyed
		? { text: t('settings.api.chipKeySet', { name }), tone: 'ok' }
		: { text: t('settings.api.chipKeyNeeded', { name }), tone: 'warn' };
}
