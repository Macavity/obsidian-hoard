import type { ExternalId, ExternalSource } from './storageTypes';

type Kind = NonNullable<ExternalId['kind']>;

/** Allowed kind per source; null = source takes no kind. */
const KINDS: Record<ExternalSource, readonly Kind[] | null> = {
	tmdb: ['movie', 'tv'],
	imdb: null,
	mal: ['anime', 'manga'],
	anilist: ['anime', 'manga'],
	gbooks: null,
	rawg: null,
	igdb: null,
	openlibrary: null,
	steam: null,
};

const ID_RE = /^[\w-]+$/;

const SOURCES = Object.keys(KINDS) as ExternalSource[];
const isSource = (s: string): s is ExternalSource => (SOURCES as string[]).includes(s);

/** Parses `source:id` or `source:kind:id`; null if unknown source, missing kind, or bad id. */
export function parseExternalId(s: string): ExternalId | null {
	const parts = s.split(':');
	const [source, ...rest] = parts;
	if (!source || !isSource(source)) return null;
	const kinds = KINDS[source];
	if (kinds) {
		const [kind, id] = rest;
		if (rest.length !== 2 || !kind || !id || !kinds.includes(kind as Kind) || !ID_RE.test(id)) return null;
		return { source, kind: kind as Kind, id };
	}
	const [id] = rest;
	if (rest.length !== 1 || !id || !ID_RE.test(id)) return null;
	return { source, id };
}

export function formatExternalId(e: ExternalId): string {
	return e.kind ? `${e.source}:${e.kind}:${e.id}` : `${e.source}:${e.id}`;
}

type LinkMatcher = (host: string, a: string, b: string) => ExternalId | null;

const imdbLink: LinkMatcher = (host, a, b) =>
	host === 'imdb.com' && a === 'title' && /^tt\d+$/.test(b) ? { source: 'imdb', id: b } : null;

const tmdbLink: LinkMatcher = (host, a, b) => {
	if (host !== 'themoviedb.org' || (a !== 'movie' && a !== 'tv')) return null;
	const id = /^(\d+)/.exec(b)?.[1];
	return id ? { source: 'tmdb', kind: a, id } : null;
};

const SOURCE_BY_HOST: Record<string, 'mal' | 'anilist'> = { 'myanimelist.net': 'mal', 'anilist.co': 'anilist' };

const animeListLink: LinkMatcher = (host, a, b) => {
	const source = SOURCE_BY_HOST[host];
	if (!source || (a !== 'anime' && a !== 'manga') || !/^\d+$/.test(b)) return null;
	return { source, kind: a, id: b };
};

const LINK_MATCHERS: readonly LinkMatcher[] = [imdbLink, tmdbLink, animeListLink];

/** Derives the identity from a pasted IMDb, TMDB, MyAnimeList or AniList URL (title sources only). */
export function externalIdFromLink(url: string): ExternalId | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	const host = u.hostname.replace(/^www\./, '');
	const [a, b] = u.pathname.split('/').filter(Boolean);
	if (!a || !b) return null;
	for (const match of LINK_MATCHERS) {
		const hit = match(host, a, b);
		if (hit) return hit;
	}
	return null;
}
