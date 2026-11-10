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

export function decodeGame(id: string, fm: Fm): Decoded<Game> {
	const r = new FmReader(fm);
	const ext = parseExternalId(r.str(C.externalId));
	let apiSource: Game['apiSource'] = '';
	let apiId = '';
	if (ext && (ext.source === 'rawg' || ext.source === 'igdb')) {
		apiSource = ext.source;
		apiId = ext.id;
	}

	let playtimeMinutes = 0;
	const pt = r.str(G.playtime);
	if (pt) {
		const p = parsePlaytime(pt);
		if (p === null) r.invalidFields.push(G.playtime);
		else playtimeMinutes = p;
	}

	let achievementsEarned = 0;
	let achievementsTotal = 0;
	const ach = r.str(G.achievements);
	if (ach) {
		const m = /^(\d+)\s*\/\s*(\d+)$/.exec(ach.trim());
		if (m) {
			achievementsEarned = Number(m[1]);
			achievementsTotal = Number(m[2]);
		} else r.invalidFields.push(G.achievements);
	}

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

export function encodeGame(g: Game): Fm {
	const out: Fm = {};
	out[C.name] = g.title;
	out[G.developer] = g.developer ?? '';
	out[G.publisher] = g.publisher ?? '';
	// `genre` carries the in-app type; `type:` stays the cross-note kind marker
	out[G.genre] = g.type ?? '';
	out[C.status] = g.status;
	if (g.priority) out[G.priority] = g.priority;
	if (g.favorite) out[C.favorite] = true;
	if (g.dateFavorited) out[C.dateFavorited] = g.dateFavorited;
	if (g.wishlist) out[G.wishlist] = true;
	out[C.rating] = g.rating | 0;
	out[G.progress] = g.progress | 0;
	if (g.playtimeMinutes > 0) out[G.playtime] = formatTime(g.playtimeMinutes);
	if (g.achievementsTotal > 0) out[G.achievements] = `${g.achievementsEarned}/${g.achievementsTotal}`;
	if (g.platforms.length > 0) out[G.platforms] = [...g.platforms];
	if (g.singleplayer) out[G.singleplayer] = true;
	if (g.coop) out[G.coop] = true;
	if (g.multiplayer) out[G.multiplayer] = true;
	out[C.dateStarted] = g.dateStarted ?? null;
	out[C.dateFinished] = g.dateFinished ?? null;
	out[C.releaseDate] = g.releaseDate ?? null;
	out[C.dateAdded] = g.dateAdded;
	out[C.dateModified] = g.dateModified;
	if (g.coverUrl) out[C.cover] = g.coverUrl;
	if (g.storeUrl) out[G.storeUrl] = g.storeUrl;
	if (g.externalLink) out[C.url] = g.externalLink;
	if (g.apiSource && g.apiId) out[C.externalId] = formatExternalId({ source: g.apiSource, id: g.apiId });
	if (g.steamAppId) out[G.steamAppId] = g.steamAppId;
	if (g.lastPlayed) out[G.lastPlayed] = g.lastPlayed;
	if (g.groups?.length) out[C.groups] = [...g.groups];
	encodeAirtime(g.airtime, out);
	out[C.type] = 'game';
	return out;
}
