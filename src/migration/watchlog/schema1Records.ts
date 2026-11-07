import type { EntryAirtime, GamesData, ReadingData, RecommendedDaily } from '../../types';
import { toEntryAirtime } from '../../DataManager';
import type { HistoryEntry } from '../../HistoryManager';
import { SHARED_SETTING_KEYS, splitNested } from '../../storage/SharedConfigStore';
import { historyKey, type HistoryStore } from '../../storage/HistoryStore';
import type { EntryCache, LocalData } from '../../storage/storageTypes';
import { isoOf } from './schema1Normalize';
import { REMOVED_SETTINGS, WISHLIST, isRecord, type IdMaps, type WatchLogData } from './schema1Types';

/** WatchLog's history plus one `group-created` per group; events already in History.md are skipped. */
export async function importHistory(history: HistoryStore, data: WatchLogData, ids: IdMaps): Promise<void> {
	const seen = new Set((await history.load()).map(historyKey));
	const candidates: HistoryEntry[] = [];
	// WatchLog entries carry only the name: link when exactly one migrated note of that source has it
	const byName = new Map<string, Set<string>>();
	const note = (source: string, name: string, oldId: string, map: Map<string, string>): void => {
		const id = map.get(oldId);
		if (!id) return;
		const key = `${source}|${name}`;
		byName.set(key, (byName.get(key) ?? new Set()).add(id));
	};
	const reading = data.reading as ReadingData;
	for (const t of data.titles) if (!t.maybe) note('Watchlist', t.title, t.id, ids.title);
	for (const b of reading.books) note('Reading', b.title, b.id, ids.book);
	for (const m of reading.manga) note('Reading', m.title, m.id, ids.manga);
	for (const g of (data.games as GamesData).games) note('Games', g.title, g.id, ids.game);
	for (const e of data.history ?? []) {
		if (!isRecord(e) || typeof e.message !== 'string') continue;
		const timestamp = isoOf(e.timestamp);
		if (!timestamp) continue;
		const ids = typeof e.titleName === 'string' ? byName.get(`${e.source ?? 'Watchlist'}|${e.titleName}`) : undefined;
		const titleId = e.titleId ?? (ids?.size === 1 ? [...ids][0] : undefined);
		candidates.push({ ...e, timestamp, ...(titleId ? { titleId } : {}) });
	}
	const groupEvents = (groups: { id: string; name: string; dateAdded: string }[], source: HistoryEntry['source']): void => {
		for (const g of groups) {
			const timestamp = isoOf(g.dateAdded);
			if (!timestamp || !g.name) continue;
			candidates.push({ id: `group-${g.id}`, timestamp, message: `Group "${g.name}" was created`, source });
		}
	};
	groupEvents(data.groups, undefined);
	groupEvents((data.games as GamesData).groups, 'Games');
	const fresh = candidates
		.filter((e) => {
			const key = historyKey(e);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	await history.appendMany(fresh);
}

/** The schema-2 data.json: device-local settings, cache and UI state with ids translated to note ids. */
export function buildLocalData(data: WatchLogData, ids: IdMaps, cache: Record<string, EntryCache>): LocalData {
	const settings: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(data.settings)) {
		if (!SHARED_SETTING_KEYS.includes(k) && !REMOVED_SETTINGS.includes(k)) settings[k] = v;
	}
	// 'Wishlist' is a flag now; a stored exclude would linger as a filter without a checkbox
	const filters = settings.gamesFilters;
	if (isRecord(filters) && Array.isArray(filters.statusExclude)) {
		filters.statusExclude = (filters.statusExclude as unknown[]).filter((n) => n !== WISHLIST);
	}

	const translate = (map: Map<string, string>, ids: unknown): string[] =>
		(Array.isArray(ids) ? ids : []).flatMap((id) => {
			const next = typeof id === 'string' ? map.get(id) : undefined;
			return next === undefined ? [] : [next];
		});
	const daily = (rec: RecommendedDaily | undefined, map: Map<string, string>): RecommendedDaily | undefined =>
		isRecord(rec) ? { date: typeof rec.date === 'string' ? rec.date : '', ids: translate(map, rec.ids) } : undefined;

	const ui: LocalData['ui'] & { gamesRecommendedDaily?: RecommendedDaily } = {};
	if (typeof data.pinnedGroupId === 'string') ui.pinnedGroup = ids.group.get(data.pinnedGroupId) ?? null;
	if (data.savedFilterPreset !== undefined) ui.savedFilterPreset = data.savedFilterPreset;
	const recommended = daily(data.recommendedDaily, ids.title);
	if (recommended) ui.recommendedDaily = recommended;
	const gamesRecommended = daily(data.games?.recommendedDaily, ids.game);
	if (gamesRecommended) ui.gamesRecommendedDaily = gamesRecommended;
	const collapsed = (data as { collapsedSeasons?: unknown }).collapsedSeasons;
	if (isRecord(collapsed)) {
		const out: Record<string, number[]> = {};
		for (const [id, seasons] of Object.entries(collapsed)) {
			const next = ids.title.get(id);
			if (next !== undefined && Array.isArray(seasons)) out[next] = seasons as number[];
		}
		ui.collapsedSeasons = out;
	}

	const local: LocalData = { schemaVersion: 2, settings, cache: cache, ui };
	// the device-local half of the reading / games settings (colors, layouts, saved filters)
	const reading = data.reading as ReadingData;
	local.reading = splitNested('reading', { ...reading.settings }).local;
	local.games = splitNested('games', { ...(data.games as GamesData).settings }).local;
	if (data.drafts) local.drafts = data.drafts;
	return local;
}

/** Group names per `<kind>:<WatchLog id>`; fills `ids.group` on the way. */
export function collectGroups(data: WatchLogData, ids: IdMaps): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	const add = (key: string, name: string): void => {
		const list = groups.get(key) ?? [];
		if (!list.includes(name)) list.push(name);
		groups.set(key, list);
	};
	const named = <T extends { name: string }>(list: T[]): T[] => list.filter((g) => typeof g.name === 'string' && g.name !== '');
	for (const g of named(data.groups)) {
		ids.group.set(g.id, g.name);
		for (const id of g.titleIds ?? []) add(`title:${id}`, g.name);
	}
	for (const g of named((data.games as GamesData).groups)) {
		for (const id of g.gameIds ?? []) add(`game:${id}`, g.name);
	}
	return groups;
}

/** Recurring schedules per `<kind>:<WatchLog id>`; 'once' entries are derived from releaseDate now (E1). */
export function collectAirtime(data: WatchLogData): Map<string, EntryAirtime> {
	const airtime = new Map<string, EntryAirtime>();
	for (const e of data.airtime ?? []) {
		if (!e?.schedule || e.schedule.recurrence === 'once') continue;
		const kind = e.source === 'game' ? 'game' : e.source === 'reading' ? (e.readingKind ?? 'book') : 'title';
		airtime.set(`${kind}:${e.titleId}`, toEntryAirtime(e));
	}
	return airtime;
}
