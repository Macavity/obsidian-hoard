import type { LookupKind } from '../../../shared/storage/storageTypes';
import type { AirtimeEntry } from '../domain/model';

/** Reading the schedule and refreshing an entry's airing data. */
export interface AirtimeReader {
	getAirtimeEntries(): AirtimeEntry[];
	refreshAiring(id: string, force?: boolean): Promise<void>;
}

/** Changing the schedule, for the Upcoming tab. */
export interface AirtimeStore extends AirtimeReader {
	addAirtimeEntry(entry: AirtimeEntry): Promise<void>;
	updateAirtimeEntry(updated: AirtimeEntry): Promise<void>;
	removeAirtimeEntry(id: string): Promise<void>;
	removeAirtimeEntriesBatch(ids: string[]): Promise<void>;
	tickAirtimeEntry(entry: AirtimeEntry, date: string): Promise<void>;
	generateAirtimeId(titleId: string): string;
	generateGameAirtimeId(gameId: string): string;
	generateReadingAirtimeId(itemId: string): string;
	isAiringTracked(entry: AirtimeEntry): boolean;
	removeClearsReleaseDate(entry: AirtimeEntry): boolean;
	lookupDue(id: string, kind: LookupKind): boolean;
}
