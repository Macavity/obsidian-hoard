import type { EntryAirtime, GamesData, ReadingData } from '../../types';
import { toEntryAirtime } from '../../DataManager';
import type { HistoryEntry } from '../../HistoryManager';
import { historyKey, type HistoryStore } from '../../storage/HistoryStore';
import { isoOf } from './schema1Normalize';
import { isRecord, type IdMaps, type WatchLogData } from './schema1Types';

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
