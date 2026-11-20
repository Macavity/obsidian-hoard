import type { ApiService } from '../../../shared/api/ApiService';
import { effectiveMediaSource } from '../../../shared/api/apiSources';
import type { SettingsReader } from '../../settings/exports';
import type { TitleSearchApi, TitleSearchResult } from '../../../shared/services/titleSearch';

/** The lookups a pasted title link resolves through, on top of the search API. */
export type TitleUrlApi = TitleSearchApi & Pick<ApiService, 'getTmdbByImdbId' | 'getOmdbByImdbId'>;

/** What a link points at; each kind carries what its lookup needs. */
type TitleLink =
	| { source: 'imdb'; id: string }
	| { source: 'tmdb'; mediaType: 'movie' | 'tv'; id: string }
	| { source: 'mal'; id: number }
	| { source: 'anilist'; id: number };

/** An IMDb id is accepted in a link to imdb.com, or typed on its own. */
const IMDB_LINK_RE = /imdb\.com\/(?:[a-z]{2}\/)?title\/(tt\d+)/i;
const IMDB_ID_RE = /^(tt\d+)$/i;
/** themoviedb.org/movie/27205-inception, /tv/1396, with or without slug and query */
const TMDB_LINK_RE = /themoviedb\.org\/(movie|tv)\/(\d+)/i;
const MAL_ANIME_RE = /myanimelist\.net\/anime\/(\d+)/i;
const ANILIST_ANIME_RE = /anilist\.co\/anime\/(\d+)/i;

/** Parses the text as a link this lookup owns; a plain regex pass, so it is cheap for every query. */
function parseTitleLink(text: string): TitleLink | null {
	const input = text.trim();
	const imdb = input.match(IMDB_LINK_RE) ?? input.match(IMDB_ID_RE);
	if (imdb) return { source: 'imdb', id: imdb[1]!.toLowerCase() };
	const tmdb = input.match(TMDB_LINK_RE);
	if (tmdb) return { source: 'tmdb', mediaType: tmdb[1]!.toLowerCase() === 'movie' ? 'movie' : 'tv', id: tmdb[2]! };
	const mal = input.match(MAL_ANIME_RE);
	if (mal) return { source: 'mal', id: parseInt(mal[1]!, 10) };
	const anilist = input.match(ANILIST_ANIME_RE);
	if (anilist) return { source: 'anilist', id: parseInt(anilist[1]!, 10) };
	return null;
}

/** 'none': the text is no title link; 'nokey': a TMDB link without a TMDB key. */
export type TitleLinkLookup = { status: 'none' | 'nokey' | 'missing' } | { status: 'found'; result: TitleSearchResult };

const NONE: TitleLinkLookup = { status: 'none' };

async function lookupImdb(settings: SettingsReader, api: TitleUrlApi, id: string): Promise<TitleSearchResult | null> {
	const source = effectiveMediaSource(settings.get(), api);
	if (source === 'tmdb') return await api.getTmdbByImdbId(id);
	if (source === 'omdb') return await api.getOmdbByImdbId(id);
	// Cinemeta is keyed by kind, and an IMDb link doesn't say which: series first, then movie (the movie endpoint answers series ids with a foreign film)
	return (await api.getCinemetaDetails(id, 'tv')) ?? (await api.getCinemetaDetails(id, 'movie'));
}

/** Resolves the text when it is an IMDb, TMDB, MyAnimeList or AniList title link; lookup failures throw. */
export async function lookupTitleLink(settings: SettingsReader, api: TitleUrlApi, text: string): Promise<TitleLinkLookup> {
	const link = parseTitleLink(text);
	if (!link) return NONE;
	let result: TitleSearchResult | null;
	if (link.source === 'imdb') {
		result = await lookupImdb(settings, api, link.id);
	} else if (link.source === 'tmdb') {
		// TMDB links carry the id and media type outright, so the detail call is direct, but it needs a key
		if (!api.hasTmdbKey()) return { status: 'nokey' };
		result = link.mediaType === 'movie' ? await api.getTmdbMovieDetails(link.id) : await api.getTmdbTvDetails(link.id);
	} else {
		result = link.source === 'mal' ? await api.getAnimeByMalId(link.id) : await api.getAniListAnimeById(link.id);
	}
	return result ? { status: 'found', result } : { status: 'missing' };
}
