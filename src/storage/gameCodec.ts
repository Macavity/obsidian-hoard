import { formatTime } from '../types';
import type { Game } from '../types';
import type { Decoded, Fm } from './storageTypes';
import { parseExternalId, formatExternalId } from './externalId';
import { FmReader, airtimeProps, decodeAirtime } from './readingCodec';
import { COMMON_PROPS as C, GAME_PROPS as G } from './properties';

const PLAYTIME_RE = /^(?:(\d{1,3}(?:,\d{3})+|\d+)h)?(?: ?(\d+)m)?$/;

/** Inverse of formatTime ("12h 30m", "1,234h", "45m"); null when unparseable. */
export function parsePlaytime(s: string): number | null {
	const t = s.trim();
	const m = PLAYTIME_RE.exec(t);
	if (!t || !m) return null;
	const h = m[1] ? Number(m[1].replace(/,/g, '')) : 0;
	return h * 60 + (m[2] ? Number(m[2]) : 0);
}

const GAME_API_SOURCES: readonly string[] = ['rawg', 'igdb', 'steam'];

function decodeApi(r: FmReader): { apiSource: Game['apiSource']; apiId: string } {
	const ext = parseExternalId(r.str(C.externalId));
	if (ext && GAME_API_SOURCES.includes(ext.source)) return { apiSource: ext.source as Game['apiSource'], apiId: ext.id };
	return { apiSource: '', apiId: '' };
}

function decodePlaytime(r: FmReader): number {
	const pt = r.str(G.playtime);
	if (!pt) return 0;
	const p = parsePlaytime(pt);
	if (p === null) {
		r.invalidFields.push(G.playtime);
		return 0;
	}
	return p;
}

function decodeAchievements(r: FmReader): { earned: number; total: number } {
	const ach = r.str(G.achievements);
	if (!ach) return { earned: 0, total: 0 };
	const m = /^(\d+)\s*\/\s*(\d+)$/.exec(ach.trim());
	if (!m) {
		r.invalidFields.push(G.achievements);
		return { earned: 0, total: 0 };
	}
	return { earned: Number(m[1]), total: Number(m[2]) };
}

export function decodeGame(id: string, fm: Record<string, unknown>): Decoded<Game> {
	const r = new FmReader(fm);
	const { apiSource, apiId } = decodeApi(r);
	const playtimeMinutes = decodePlaytime(r);
	const { earned: achievementsEarned, total: achievementsTotal } = decodeAchievements(r);

	const entry: Game = {
		id,
		title: r.str(C.name),
		developer: r.str(G.developer),
		publisher: r.str(G.publisher),
		type: r.str(G.genre),
		status: r.str(C.status),
		priority: r.str(G.priority),
		favorite: r.bool(C.favorite),
		dateFavorited: r.strOrNull(C.dateFavorited) ?? undefined,
		wishlist: r.bool(G.wishlist),
		rating: r.num(C.rating),
		progress: r.num(G.progress),
		playtimeMinutes,
		achievementsEarned,
		achievementsTotal,
		platforms: r.list(G.platforms),
		singleplayer: r.bool(G.singleplayer),
		coop: r.bool(G.coop),
		multiplayer: r.bool(G.multiplayer),
		coverUrl: r.str(C.cover),
		apiSource,
		apiId,
		// a steam External ID identifies the app too, so sync matching works without the property
		steamAppId: r.str(G.steamAppId) || (apiSource === 'steam' ? apiId : ''),
		lastPlayed: r.strOrNull(G.lastPlayed),
		storeUrl: r.str(G.storeUrl),
		externalLink: r.str(C.url),
		vaultPage: `${id}.md`,
		releaseDate: r.strOrNull(C.releaseDate),
		dateStarted: r.strOrNull(C.dateStarted),
		dateFinished: r.strOrNull(C.dateFinished),
		dateAdded: r.str(C.dateAdded),
		dateModified: r.str(C.dateModified),
		groups: r.list(C.groups),
		airtime: decodeAirtime(r),
	};
	if (!entry.dateFavorited) delete entry.dateFavorited;
	if (!entry.groups?.length) delete entry.groups;
	if (!entry.airtime) delete entry.airtime;
	return { entry, invalidFields: r.invalidFields };
}

/** `{ key: value }` when the value is set, else `{}`: optional properties stay out of the note. */
function optional(key: string, value: unknown): Fm {
	return value ? { [key]: value } : {};
}

function identityProps(g: Game): Fm {
	return {
		[C.name]: g.title,
		[G.developer]: g.developer ?? '',
		[G.publisher]: g.publisher ?? '',
		// `genre` carries the in-app type; `type:` stays the cross-note kind marker
		[G.genre]: g.type ?? '',
		[C.status]: g.status,
		...optional(G.priority, g.priority),
		...optional(C.favorite, g.favorite),
		...optional(C.dateFavorited, g.dateFavorited),
		...optional(G.wishlist, g.wishlist),
	};
}

function progressProps(g: Game): Fm {
	return {
		[C.rating]: g.rating | 0,
		[G.progress]: g.progress | 0,
		...optional(G.playtime, g.playtimeMinutes > 0 && formatTime(g.playtimeMinutes)),
		...optional(G.achievements, g.achievementsTotal > 0 && `${g.achievementsEarned}/${g.achievementsTotal}`),
		...optional(G.platforms, g.platforms.length > 0 && [...g.platforms]),
		...optional(G.singleplayer, g.singleplayer),
		...optional(G.coop, g.coop),
		...optional(G.multiplayer, g.multiplayer),
	};
}

function dateProps(g: Game): Fm {
	return {
		[C.dateStarted]: g.dateStarted ?? null,
		[C.dateFinished]: g.dateFinished ?? null,
		[C.releaseDate]: g.releaseDate ?? null,
		[C.dateAdded]: g.dateAdded,
		[C.dateModified]: g.dateModified,
	};
}

function linkProps(g: Game): Fm {
	return {
		...optional(C.cover, g.coverUrl),
		...optional(G.storeUrl, g.storeUrl),
		...optional(C.url, g.externalLink),
		...optional(C.externalId, g.apiSource && g.apiId && formatExternalId({ source: g.apiSource, id: g.apiId })),
		...optional(G.steamAppId, g.steamAppId),
		...optional(G.lastPlayed, g.lastPlayed),
		...optional(C.groups, g.groups?.length && [...g.groups]),
	};
}

export function encodeGame(g: Game): Record<string, unknown> {
	return {
		...identityProps(g),
		...progressProps(g),
		...dateProps(g),
		...linkProps(g),
		...airtimeProps(g.airtime),
		[C.type]: 'game',
	};
}
