import { Notice } from 'obsidian';
import type { AddHit, AddKind, AddProvider } from '../../add/exports';
import type { SettingsReader, SettingsWriter } from '../../settings/exports';
import { apiErrorMessage } from '../../../shared/api/ApiService';
import { effectiveMediaSource } from '../../../shared/api/apiSources';
import { t } from '../../../shared/i18n';
import { LibraryIndex } from '../../../shared/services/LibraryIndex';
import { RecentRows } from '../../../shared/services/recentRows';
import {
	episodesLabel,
	isAnimeResult,
	resultIdKeys,
	searchTitles,
	type TitleSearchResult,
} from '../../../shared/services/titleSearch';
import { mountTitleAddForm, sourceTypeOfKind, type AddTitleApi, type AddTitleStore } from './TitleAddForm';
import { lookupTitleLink, type TitleUrlApi } from './titleUrl';

const KINDS: readonly AddKind[] = ['anime', 'series', 'movie'];
/** Hits whose search row the provider still remembers; older ones fall out. */
const REMEMBERED_RESULTS = 500;

function hitId(result: TitleSearchResult): string {
	if (!isAnimeResult(result)) return result.imdbId;
	return result.anilistId && result.anilistId > 0 ? `anilist:${result.anilistId}` : `mal:${result.malId}`;
}

/** What a movie or series link resolved to: the media type decides the kind. */
function kindOfResult(result: TitleSearchResult): AddKind {
	if (isAnimeResult(result)) return 'anime';
	return result.mediaType === 'movie' ? 'movie' : 'series';
}

/** The watchlist's side of the add wizard: anime, series and movies, as an entry or a Maybe note. */
export function createWatchlistAddProvider({ settings, titles, api }: {
	settings: SettingsReader & SettingsWriter;
	titles: AddTitleStore;
	api: AddTitleApi & TitleUrlApi;
}): AddProvider {
	// search rows by `${kind}:${hit.id}`, so a picked hit still carries its source record into the form
	const rows = new RecentRows<TitleSearchResult>(REMEMBERED_RESULTS);

	const remember = (kind: AddKind, hit: AddHit, result: TitleSearchResult): void => {
		rows.set(`${kind}:${hit.id}`, result);
	};

	const toHit = (kind: AddKind, result: TitleSearchResult, library: LibraryIndex): AddHit => {
		const idKeys = resultIdKeys(result, effectiveMediaSource(settings.get(), api));
		const hit: AddHit = {
			kind,
			id: hitId(result),
			title: result.title,
			meta: `${episodesLabel(result)} · ${result.releaseDate}`,
			thumbUrl: result.posterUrl,
			fallbackIcon: '🎬',
			inLibrary: library.lookup(idKeys, result.title),
		};
		remember(kind, hit, result);
		return hit;
	};

	// the index covers the watchlist only; built per call because the library changes between searches
	const buildLibrary = (): LibraryIndex => LibraryIndex.build({ watchlist: () => titles.getTitles() }, ['watchlist']);

	return {
		kinds: KINDS,
		maybeKinds: KINDS,

		async search(kind, query) {
			const results = await searchTitles(settings, api, sourceTypeOfKind(kind), query, '');
			const library = buildLibrary();
			const hits = results.map((result) => toHit(kind, result, library));
			rows.trim();
			return hits;
		},

		renderForm(host, ctx) {
			const result = ctx.hit ? rows.get(`${ctx.kind}:${ctx.hit.id}`) ?? null : null;
			if (ctx.hit && !result) new Notice(t('add.url.lookupExpired'));
			return mountTitleAddForm(host, settings, titles, api, ctx, result);
		},

		async resolveUrl(text) {
			try {
				const lookup = await lookupTitleLink(settings, api, text);
				if (lookup.status === 'none') return null;
				if (lookup.status !== 'found') return { message: t(lookup.status === 'nokey' ? 'add.url.noTmdbKey' : 'add.url.notFound') };
				const hit = toHit(kindOfResult(lookup.result), lookup.result, buildLibrary());
				rows.trim();
				return hit;
			} catch (err) {
				return { message: apiErrorMessage(err) };
			}
		},
	};
}
