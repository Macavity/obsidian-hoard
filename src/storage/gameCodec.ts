import { formatTime } from '../types';
import type { Game } from '../types';
import type { Decoded } from './storageTypes';
import { parseExternalId, formatExternalId } from './externalId';
import { FmReader, decodeAirtime, encodeAirtime } from './readingCodec';
import { COMMON_PROPS as C, GAME_PROPS as G } from './properties';

type Fm = Record<string, unknown>;

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
		steamAppId: r.str(G.steamAppId),
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

/** Sets `key` only when `value` is truthy, so empty optional fields stay out of the note. */
function setIf(out: Fm, key: string, value: unknown): void {
	if (value) out[key] = value;
}

function encodeProgress(g: Game, out: Fm): void {
	out[C.rating] = g.rating | 0;
	out[G.progress] = g.progress | 0;
	if (g.playtimeMinutes > 0) out[G.playtime] = formatTime(g.playtimeMinutes);
	if (g.achievementsTotal > 0) out[G.achievements] = `${g.achievementsEarned}/${g.achievementsTotal}`;
	if (g.platforms.length > 0) out[G.platforms] = [...g.platforms];
	setIf(out, G.singleplayer, g.singleplayer);
	setIf(out, G.coop, g.coop);
	setIf(out, G.multiplayer, g.multiplayer);
}

function encodeLinks(g: Game, out: Fm): void {
	setIf(out, C.cover, g.coverUrl);
	setIf(out, G.storeUrl, g.storeUrl);
	setIf(out, C.url, g.externalLink);
	if (g.apiSource && g.apiId) out[C.externalId] = formatExternalId({ source: g.apiSource, id: g.apiId });
	setIf(out, G.steamAppId, g.steamAppId);
	setIf(out, G.lastPlayed, g.lastPlayed);
	if (g.groups?.length) out[C.groups] = [...g.groups];
}

export function encodeGame(g: Game): Record<string, unknown> {
	const out: Fm = {};
	out[C.name] = g.title;
	out[G.developer] = g.developer ?? '';
	out[G.publisher] = g.publisher ?? '';
	// `genre` carries the in-app type; `type:` stays the cross-note kind marker
	out[G.genre] = g.type ?? '';
	out[C.status] = g.status;
	setIf(out, G.priority, g.priority);
	setIf(out, C.favorite, g.favorite);
	setIf(out, C.dateFavorited, g.dateFavorited);
	setIf(out, G.wishlist, g.wishlist);
	encodeProgress(g, out);
	out[C.dateStarted] = g.dateStarted ?? null;
	out[C.dateFinished] = g.dateFinished ?? null;
	out[C.releaseDate] = g.releaseDate ?? null;
	out[C.dateAdded] = g.dateAdded;
	out[C.dateModified] = g.dateModified;
	encodeLinks(g, out);
	encodeAirtime(g.airtime, out);
	out[C.type] = 'game';
	return out;
}
