import type { AirtimeEntry, AirtimeRecurrence } from '../../../airtime/contract';
import type { HoardGroup } from '../../../watchlist/contract';
import type { HistoryAction, HistoryEntry, HistorySource } from '../../../../shared/domain/history';
import { readMaybe } from '../../../../shared/storage/entryReaders';
import {
	at, readList, readOptionalNumber, readOptionalString, readRecord, readString, readStringList,
} from '../../../../shared/domain/read';
import { defined, isRecord } from '../../../../shared/domain/sharedHelpers';
import { isoOf, normalizeGames, normalizeReading, normalizeTitle, readEntries } from './schema1Normalize';
import type { PreparedData, WatchLogTitle } from './schema1Types';

/** WatchLog's data.json read field by field: what has the wrong type is dropped, and the dropped entries are listed. */

const RECURRENCES: readonly AirtimeRecurrence[] = ['once', 'daily', 'weekly', 'monthly'];
const AIRTIME_SOURCES = ['watchlist', 'reading', 'game'] as const;
const READING_KINDS = ['book', 'manga'] as const;
const HISTORY_SOURCES: readonly HistorySource[] = ['Watchlist', 'Reading', 'Games'];
const HISTORY_ACTIONS: readonly HistoryAction[] = ['added', 'completed', 'deleted', 'status', 'rating', 'watched', 'group'];

function readTitle(v: unknown): WatchLogTitle | undefined {
	if (!isRecord(v) || typeof v.id !== 'string' || typeof v.title !== 'string') return undefined;
	return normalizeTitle(v);
}

function readGroup(v: unknown): HoardGroup | undefined {
	const id = at(v, 'id');
	const name = at(v, 'name');
	if (typeof id !== 'string' || typeof name !== 'string') return undefined;
	return { id, name, titleIds: readStringList(at(v, 'titleIds')), dateAdded: readString(at(v, 'dateAdded')) };
}

function readAirtimeEntry(v: unknown): AirtimeEntry | undefined {
	const titleId = at(v, 'titleId');
	const recurrence = RECURRENCES.find((r) => r === at(v, 'schedule', 'recurrence'));
	if (typeof titleId !== 'string' || !recurrence) return undefined;
	const schedule = at(v, 'schedule');
	return {
		id: readString(at(v, 'id')),
		titleId,
		schedule: {
			recurrence,
			...defined({
				releaseDate: readOptionalString(at(schedule, 'releaseDate')),
				releaseTime: readOptionalString(at(schedule, 'releaseTime')),
				dayOfWeek: readOptionalNumber(at(schedule, 'dayOfWeek')),
				dayOfMonth: readOptionalNumber(at(schedule, 'dayOfMonth')),
			}),
		},
		dateAdded: readString(at(v, 'dateAdded')),
		...defined({
			source: AIRTIME_SOURCES.find((s) => s === at(v, 'source')),
			readingKind: READING_KINDS.find((k) => k === at(v, 'readingKind')),
			currentSeason: readOptionalNumber(at(v, 'currentSeason')),
			currentEpisode: readOptionalNumber(at(v, 'currentEpisode')),
			totalEpisodes: readOptionalNumber(at(v, 'totalEpisodes')),
			totalSeasons: readOptionalNumber(at(v, 'totalSeasons')),
			lastAcknowledgedDate: readOptionalString(at(v, 'lastAcknowledgedDate')),
		}),
	};
}

/** A history entry with a message and a date; the date is normalized to an ISO timestamp. */
export function readHistory(v: unknown): HistoryEntry | undefined {
	const message = at(v, 'message');
	const timestamp = isoOf(at(v, 'timestamp'));
	if (typeof message !== 'string' || !timestamp) return undefined;
	return {
		id: readString(at(v, 'id')),
		timestamp,
		message,
		...defined({
			source: HISTORY_SOURCES.find((s) => s === at(v, 'source')),
			action: HISTORY_ACTIONS.find((a) => a === at(v, 'action')),
			titleName: readOptionalString(at(v, 'titleName')),
			titleId: readOptionalString(at(v, 'titleId')),
		}),
	};
}

/**
 * WatchLog data of unknown shape as the import needs it: entries without an id and a title are left
 * out and listed in `skipped` (what an earlier read skipped stays listed), everything else is
 * filled with WatchLog's load-time corrections applied.
 */
export function prepareData(raw: unknown): PreparedData {
	const skipped = readStringList(at(raw, 'skipped'));
	const field = (key: string): unknown => at(raw, key);
	return {
		titles: readEntries(field('titles'), readTitle, 'title', skipped),
		groups: readList(field('groups'), readGroup),
		settings: readRecord(field('settings')),
		airtime: readList(field('airtime'), readAirtimeEntry),
		maybe: readEntries(field('maybe'), readMaybe, 'maybe', skipped),
		reading: normalizeReading(field('reading'), skipped),
		games: normalizeGames(field('games'), skipped),
		history: readList(field('history'), readHistory),
		migratedReadingHistory: field('migratedReadingHistory') === true,
		skipped,
	};
}
