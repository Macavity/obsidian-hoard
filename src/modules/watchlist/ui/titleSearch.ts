import type { SettingsReader } from '../../../shared/services/SettingsService';
import { t } from '../../../shared/i18n';
import { typeLabel } from '../../../shared/i18n/labels';
import type { MediaFields } from '../../../shared/ui/FormCells';
import type { AnimeSearchResult, MediaSearchResult, Season } from '../../../shared/domain/types';
import { getApiGroupForType } from '../../../shared/domain/types';
import { animeResultIdKeys, mediaResultIdKeys } from '../../../shared/services/LibraryIndex';
import { effectiveMediaSource, type MediaSource } from '../../../shared/api/apiSources';
import { SEARCH_PAGE_SIZE, SEARCH_RESULT_LIMIT, type ApiService } from '../../../shared/api/ApiService';
import { found, NOT_FOUND, type LookupResult } from '../../../shared/api/lookup';

/** What searching and resolving a title pick reads. */
export interface TitleSearchDeps {
	settings: SettingsReader;
	api: Pick<
		ApiService,
		| 'hasOmdbKey' | 'hasTmdbKey' | 'searchAniList' | 'searchAnime' | 'searchTmdb' | 'searchOmdb' | 'searchCinemeta'
		| 'getCinemetaDetails' | 'getTmdbMovieDetails' | 'getTmdbTvDetails' | 'getOmdbMovieDetails' | 'getOmdbTvDetails'
	>;
}

export type TitleSearchResult = AnimeSearchResult | MediaSearchResult;

export function isAnimeResult(r: TitleSearchResult): r is AnimeSearchResult {
	return 'malId' in r;
}

/** Searches the API configured for the type; null when the type has none. */
export async function searchTitles(
	deps: TitleSearchDeps,
	type: string,
	query: string,
	year: string,
): Promise<TitleSearchResult[] | null> {
	const api = deps.api;
	const apiGroup = getApiGroupForType(type, deps.settings.get().typeApiMapping);
	if (apiGroup === '') return null;
	if (apiGroup === 'anime') {
		const animeSource = deps.settings.get().animeApiSource ?? 'jikan';
		return animeSource === 'anilist'
			? await api.searchAniList(query, year)
			: await api.searchAnime(query, year, SEARCH_RESULT_LIMIT);
	}
	const kind = type === 'Movie' ? 'movie' : 'series';
	const source = effectiveMediaSource(deps.settings.get(), api);
	if (source === 'tmdb') return await api.searchTmdb(query, kind, year);
	if (source === 'omdb') return await api.searchOmdb(query, kind, year);
	return await api.searchCinemeta(query, kind, year);
}

/** Full movie/TV record for a search row from the active media API. */
export function fetchMediaDetails(
	deps: TitleSearchDeps,
	result: MediaSearchResult,
): Promise<MediaSearchResult | null> {
	const api = deps.api;
	const source = effectiveMediaSource(deps.settings.get(), api);
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
	/** undefined = no source answered yet; the detail view looks it up on first open */
	trailer: LookupResult<string> | undefined;
	director: string[];
	cast: string[];
	studio: string[];
	/** Cinemeta picks only: its rows carry a poster, so the form keeps it instead of leaving it empty. */
	posterUrl?: string;
	/** Anime picks only: exactly one id is set. */
	animeIds?: { malId: number | null; anilistId: number | null };
}

/** An anime search row carries its trailer: a URL is found, an absent one means the source has none. */
function trailerOf(url: string | undefined): LookupResult<string> {
	return url ? found(url) : NOT_FOUND;
}

function pickFromMedia(full: MediaSearchResult): TitlePick {
	return {
		title: full.title,
		episodes: full.episodes,
		duration: full.episodeDuration,
		releaseDate: full.releaseDate,
		link: full.url,
		seasons: full.seasons,
		// only TMDB details carry a trailer: no URL is no answer, and the detail view asks the right source later
		trailer: full.trailerUrl ? found(full.trailerUrl) : undefined,
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
		trailer: trailerOf(anime.trailerUrl),
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
 * the selection went stale and the form must not be touched. A missing detail record or a failed fetch applies the search row.
 */
export async function resolvePick(
	deps: TitleSearchDeps,
	result: TitleSearchResult,
	isCurrent: () => boolean,
	apply: (pick: TitlePick) => void,
): Promise<boolean> {
	if (isAnimeResult(result)) {
		apply(pickFromAnime(result));
		return true;
	}
	const keepPoster = effectiveMediaSource(deps.settings.get(), deps.api) === 'cinemeta';
	const withPoster = (pick: TitlePick, ...rows: TitleSearchResult[]): TitlePick =>
		keepPoster ? { ...pick, posterUrl: rows.map((r) => r.posterUrl).find(Boolean) ?? '' } : pick;
	try {
		const full = await fetchMediaDetails(deps, result);
		if (!isCurrent()) return false;
		apply(full ? withPoster(pickFromMedia(full), full, result) : withPoster(pickFromRow(result), result));
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
	deps: TitleSearchDeps,
	selectedType: string,
	onTypeChange: (type: string) => void,
) {
	return {
		placeholder: t('misc.titleSearch.placeholder'),
		withYear: true,
		pageSize: SEARCH_PAGE_SIZE,
		typeSelect: {
			names: deps.settings.get().types.map((t) => t.name),
			selected: selectedType,
			onChange: onTypeChange,
			format: typeLabel,
		},
	};
}
