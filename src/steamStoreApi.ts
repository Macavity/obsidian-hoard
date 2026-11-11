import type { GameDetailsResult, GameSearchResult, SteamAppDetails } from './ApiService';

/**
 * The portrait library capsule. Steam's `header_image` is a 460×215 landscape banner that
 * letterboxes badly in portrait poster cards; the 600×900 capsule is the shape the grid
 * expects. Not every app publishes one — the card's onerror falls back to the placeholder.
 */
export function steamLibraryCover(appId: string): string {
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

const PLATFORM_NAMES: Array<[string, string]> = [
	['windows', 'PC'],
	['mac', 'macOS'],
	['linux', 'Linux'],
];

export function steamStoreSearchUrl(query: string): string {
	return `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function platformNames(raw: unknown): string[] {
	if (!isRecord(raw)) return [];
	return PLATFORM_NAMES.filter(([key]) => raw[key] === true).map(([, name]) => name);
}

function mapItem(item: unknown): GameSearchResult | null {
	if (!isRecord(item) || item.type !== 'app') return null;
	const id = item.id;
	if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
	return {
		source: 'steam',
		id,
		title: typeof item.name === 'string' ? item.name : '',
		releaseDate: '',
		coverUrl: steamLibraryCover(String(id)),
		platforms: platformNames(item.platforms),
		url: `https://store.steampowered.com/app/${id}/`,
	};
}

export function mapSteamStoreSearch(json: unknown): GameSearchResult[] {
	if (!isRecord(json) || !Array.isArray(json.items)) return [];
	return json.items.map(mapItem).filter((r): r is GameSearchResult => r !== null);
}

export function steamDetailsToGameDetails(row: GameSearchResult, d: SteamAppDetails): GameDetailsResult {
	return {
		...row,
		title: d.name || row.title,
		developer: d.developer,
		publisher: d.publisher,
		releaseDate: d.releaseDate ?? '',
		coverUrl: d.coverUrl || row.coverUrl,
		singleplayer: d.singleplayer,
		coop: d.coop,
		multiplayer: d.multiplayer,
		storeUrl: d.storeUrl,
	};
}
