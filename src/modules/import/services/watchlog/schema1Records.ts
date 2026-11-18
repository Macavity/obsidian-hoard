import type { EntryAirtime } from '../../../../shared/domain/types';
import type { HistoryEntry } from '../../../../shared/services/HistoryManager';
import { toEntryAirtime } from '../../../watchlist/services/DataManager';
import { historyKey, type HistoryStore } from '../../../../shared/storage/HistoryStore';
import { isoOf } from './schema1Normalize';
import type { IdMaps, PreparedData, WatchLogData } from './schema1Types';

type NameIndex = Map<string, Set<string>>;

/** WatchLog entries carry only the name: the migrated note ids per `<source>|<name>`. */
function nameIndex(data: PreparedData, ids: IdMaps): NameIndex {
	const byName: NameIndex = new Map();
	const note = (source: string, name: string, oldId: string, map: Map<string, string>): void => {
		const id = map.get(oldId);
		if (!id) return;
		const key = `${source}|${name}`;
		byName.set(key, (byName.get(key) ?? new Set()).add(id));
	};
	for (const t of data.titles) if (!t.maybe) note('Watchlist', t.title, t.id, ids.title);
	for (const b of data.reading.books) note('Reading', b.title, b.id, ids.book);
	for (const m of data.reading.manga) note('Reading', m.title, m.id, ids.manga);
	for (const g of data.games.games) note('Games', g.title, g.id, ids.game);
	return byName;
}

/** Links an entry to its note when it has no link and exactly one migrated note of its source has the name. */
function linkEntry(e: HistoryEntry, byName: NameIndex): HistoryEntry {
	if (e.titleId || e.titleName === undefined) return e;
	const notes = byName.get(`${e.source ?? 'Watchlist'}|${e.titleName}`);
	const [only] = notes ?? [];
	return notes?.size === 1 && only ? { ...e, titleId: only } : e;
}

function groupEvents(groups: { id: string; name: string; dateAdded: string }[], source: HistoryEntry['source']): HistoryEntry[] {
	const events: HistoryEntry[] = [];
	for (const g of groups) {
		const timestamp = isoOf(g.dateAdded);
		if (!timestamp || !g.name) continue;
		events.push({ id: `group-${g.id}`, timestamp, message: `Group "${g.name}" was created`, source });
	}
	return events;
}

/** WatchLog's history plus one `group-created` per group; events already in History.md are skipped. */
export async function importHistory(history: HistoryStore, data: PreparedData, ids: IdMaps): Promise<void> {
	const seen = new Set((await history.load()).map(historyKey));
	const byName = nameIndex(data, ids);
	const candidates = [
		...(data.history ?? []).map((e) => linkEntry(e, byName)),
		...groupEvents(data.groups, undefined),
		...groupEvents(data.games.groups, 'Games'),
	];
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
export function collectGroups(data: PreparedData, ids: IdMaps): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	const add = (key: string, name: string): void => {
		const list = groups.get(key) ?? [];
		if (!list.includes(name)) list.push(name);
		groups.set(key, list);
	};
	const named = <T extends { name: string }>(list: T[]): T[] => list.filter((g) => g.name !== '');
	for (const g of named(data.groups)) {
		ids.group.set(g.id, g.name);
		for (const id of g.titleIds) add(`title:${id}`, g.name);
	}
	for (const g of named(data.games.groups)) {
		for (const id of g.gameIds) add(`game:${id}`, g.name);
	}
	return groups;
}

/** Recurring schedules per `<kind>:<WatchLog id>`; 'once' entries are derived from releaseDate now (E1). */
export function collectAirtime(data: WatchLogData): Map<string, EntryAirtime> {
	const airtime = new Map<string, EntryAirtime>();
	for (const e of data.airtime ?? []) {
		if (e.schedule.recurrence === 'once') continue;
		const kind = e.source === 'game' ? 'game' : e.source === 'reading' ? (e.readingKind ?? 'book') : 'title';
		airtime.set(`${kind}:${e.titleId}`, toEntryAirtime(e));
	}
	return airtime;
}
