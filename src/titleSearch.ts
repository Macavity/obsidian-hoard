import type HoardPlugin from './main';
import { t } from './i18n';
import { typeLabel } from './i18n/labels';
import type { MediaFields } from './ui/FormCells';
import type { AnimeSearchResult, MediaSearchResult, Season } from './types';
import { getApiGroupForType } from './types';
import { animeResultIdKeys, mediaResultIdKeys } from './LibraryIndex';
import { effectiveMediaSource, type MediaSource } from './apiSources';
import { SEARCH_PAGE_SIZE, SEARCH_RESULT_LIMIT } from './ApiService';

export type TitleSearchResult = AnimeSearchResult | MediaSearchResult;

export function isAnimeResult(r: TitleSearchResult): r is AnimeSearchResult {
	return 'malId' in r;
}

/** Searches the API configured for the type; null when the type has none. */
export async function searchTitles(
	plugin: HoardPlugin,
	type: string,
	query: string,
	year: string,
): Promise<TitleSearchResult[] | null> {
	const api = plugin.apiService;
	const apiGroup = getApiGroupForType(type, plugin.settings.typeApiMapping);
	if (apiGroup === '') return null;
	if (apiGroup === 'anime') {
		const animeSource = plugin.settings.animeApiSource ?? 'jikan';
		return animeSource === 'anilist'
			? await api.searchAniList(query, year)
			: await api.searchAnime(query, year, SEARCH_RESULT_LIMIT);
	}
	const kind = type === 'Movie' ? 'movie' : 'series';
	const source = effectiveMediaSource(plugin.settings, api);
	if (source === 'tmdb') return await api.searchTmdb(query, kind, year);
	if (source === 'omdb') return await api.searchOmdb(query, kind, year);
	return await api.searchCinemeta(query, kind, year);
}

/** Full movie/TV record for a search row from the active media API. */
export function fetchMediaDetails(
	plugin: HoardPlugin,
	result: MediaSearchResult,
): Promise<MediaSearchResult | null> {
	const api = plugin.apiService;
	const source = effectiveMediaSource(plugin.settings, api);
	const tv = result.mediaType === 'tv';
	if (source === 'cinemeta') return api.getCinemetaDetails(result.imdbId, result.mediaType);
	if (source === 'tmdb') return tv ? api.getTmdbTvDetails(result.imdbId) : api.getTmdbMovieDetails(result.imdbId);
	return tv ? api.getOmdbTvDetails(result.imdbId) : api.getOmdbMovieDetails(result.imdbId);
}

/** "12 eps", or the media type for movies and rows without an episode count. */
export function episodesLabel(result: TitleSearchResult): string {
	if (isAnimeResult(result) || result.episodes > 0) return t('misc.titleSearch.episodes', { count: result.episodes });
	return result.mediaType;
}

/** Library identity keys of a search row. */
export function resultIdKeys(result: TitleSearchResult, source: MediaSource): string[] {
	return isAnimeResult(result) ? animeResultIdKeys(result) : mediaResultIdKeys(result, source);
}

/** Form values taken from a search row or its detail record. */
export interface TitlePick {
	title: string;
	episodes: number;
	duration: number;
	releaseDate: string;
	link: string;
	seasons: Season[];
	trailerUrl: string;
	director: string[];
	cast: string[];
	studio: string[];
	/** Cinemeta picks only: its rows carry a poster, so the form keeps it instead of leaving it empty. */
	posterUrl?: string;
	/** Anime picks only: exactly one id is set. */
	animeIds?: { malId: number | null; anilistId: number | null };
}

function pickFromMedia(full: MediaSearchResult): TitlePick {
	return {
		title: full.title,
		episodes: full.episodes,
		duration: full.episodeDuration,
		releaseDate: full.releaseDate,
		link: full.url,
		seasons: full.seasons,
		trailerUrl: full.trailerUrl ?? '',
		director: full.director ?? [],
		cast: full.cast ?? [],
		studio: full.studio ?? [],
	};
}

type AnimePickFields = Omit<TitlePick, 'animeIds'>;

function animeFields(anime: AnimeSearchResult): AnimePickFields {
	return {
		title: anime.title,
		episodes: anime.episodes,
		duration: anime.duration,
		releaseDate: anime.releaseDate,
		link: anime.url,
		seasons: anime.seasons,
		trailerUrl: anime.trailerUrl ?? '',
		// anime sources carry no credits, so a pick clears any stale movie/TV selection
		director: [],
		cast: [],
		studio: [],
	};
}

function pickFromAnime(anime: AnimeSearchResult): TitlePick {
	const useAnilist = !!anime.anilistId && anime.anilistId > 0;
	return {
		...animeFields(anime),
		animeIds: useAnilist
			? { malId: null, anilistId: anime.anilistId ?? null }
			: { malId: anime.malId, anilistId: null },
	};
}

/** Fallback when the detail fetch failed: what the search row carried. */
function pickFromRow(result: TitleSearchResult): TitlePick {
	return isAnimeResult(result) ? animeFields(result) : pickFromMedia(result);
}

/**
 * Fetches the details for a selected row and hands the resulting pick to apply. Returns false when
 * the selection went stale and the form must not be touched. A missing detail record applies nothing.
 */
export async function resolvePick(
	plugin: HoardPlugin,
	result: TitleSearchResult,
	isCurrent: () => boolean,
	apply: (pick: TitlePick) => void,
): Promise<boolean> {
	if (isAnimeResult(result)) {
		apply(pickFromAnime(result));
		return true;
	}
	const keepPoster = effectiveMediaSource(plugin.settings, plugin.apiService) === 'cinemeta';
	const withPoster = (pick: TitlePick, ...rows: TitleSearchResult[]): TitlePick =>
		keepPoster ? { ...pick, posterUrl: rows.map((r) => r.posterUrl).find(Boolean) ?? '' } : pick;
	try {
		const full = await fetchMediaDetails(plugin, result);
		if (!isCurrent()) return false;
		if (full) apply(withPoster(pickFromMedia(full), full, result));
	} catch {
		if (!isCurrent()) return false;
		apply(withPoster(pickFromRow(result), result));
	}
	return true;
}

/** Copies the pick's core values into the form's media fields. */
export function fillMediaFields(media: MediaFields, pick: TitlePick): void {
	media.title = pick.title;
	media.episodes = pick.episodes;
	media.duration = pick.duration;
	media.releaseDate = pick.releaseDate;
	media.link = pick.link;
}

/** Picker settings shared by the add-title and add-maybe modals. */
export function titlePickerBase(
	plugin: HoardPlugin,
	selectedType: string,
	onTypeChange: (type: string) => void,
) {
	return {
		placeholder: t('misc.titleSearch.placeholder'),
		withYear: true,
		pageSize: SEARCH_PAGE_SIZE,
		typeSelect: {
			names: plugin.settings.types.map((t) => t.name),
			selected: selectedType,
			onChange: onTypeChange,
			format: typeLabel,
		},
	};
}
