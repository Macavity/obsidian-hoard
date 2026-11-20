import type { AddHit, AddKind, AddProvider } from '../../add/exports';
import { rawgResizedCover, type GameSearchResult } from '../../../shared/api/ApiService';
import { effectiveGameSource } from '../../../shared/api/apiSources';
import { t } from '../../../shared/i18n';
import { LibraryIndex, gameResultIdKeys } from '../../../shared/services/LibraryIndex';
import type { SettingsReader } from '../../settings/exports';
import { mountGameAddForm, type AddGameApi, type AddGameStore } from './GameAddForm';

const KINDS: readonly AddKind[] = ['game'];
/** Hits whose search row the provider still remembers; older ones fall out. */
const REMEMBERED_RESULTS = 500;

/** "2021 · PC, PS5": release year and up to three platforms. */
function metaOf(result: GameSearchResult): string {
	const year = result.releaseDate.match(/^(\d{4})/)?.[1] ?? '—';
	const platforms = result.platforms.slice(0, 3).join(', ') || t('add.game.unknownPlatforms');
	return `${year} · ${platforms}`;
}

/** The Games module's side of the add wizard. Steam needs no key, so search always works. */
export function createGamesAddProvider({ settings, games, api }: {
	settings: SettingsReader;
	games: AddGameStore;
	api: AddGameApi;
}): AddProvider {
	// search rows by hit id, so a picked hit still carries its source record into the form
	const rows = new Map<string, GameSearchResult>();

	const searchSource = (query: string): Promise<GameSearchResult[]> => {
		const source = effectiveGameSource(settings.get(), api);
		if (source === 'igdb') return api.searchIgdbGames(query);
		if (source === 'rawg') return api.searchRawgGames(query);
		return api.searchSteamStore(query);
	};

	return {
		kinds: KINDS,

		async search(_kind, query) {
			const results = await searchSource(query);
			// built per call because the library changes between searches
			const library = LibraryIndex.build({ games: () => games.getGames() }, ['games']);
			return results.map((result): AddHit => {
				const id = `${result.source}:${result.id}`;
				rows.set(id, result);
				for (const oldest of rows.keys()) {
					if (rows.size <= REMEMBERED_RESULTS) break;
					rows.delete(oldest);
				}
				return {
					kind: 'game',
					id,
					title: result.title,
					meta: metaOf(result),
					// cards are full width, so ask for a sharper rendition
					thumbUrl: rawgResizedCover(result.coverUrl, 600),
					fallbackIcon: '🎮',
					inLibrary: library.lookup(gameResultIdKeys(result), result.title),
				};
			});
		},

		renderForm(host, ctx) {
			const row = ctx.hit ? rows.get(ctx.hit.id) ?? null : null;
			return mountGameAddForm(host, settings, games, api, ctx, row);
		},
	};
}
