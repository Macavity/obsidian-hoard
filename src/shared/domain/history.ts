export type HistorySource = 'Watchlist' | 'Reading' | 'Games';

export type HistoryAction = 'added' | 'completed' | 'deleted' | 'status' | 'rating' | 'watched' | 'group';

export interface HistoryEntry {
	id: string;
	timestamp: string;
	message: string;
	source?: HistorySource;
	action?: HistoryAction;
	titleName?: string;
	/** Note id of the title (C1); history lines link to it. */
	titleId?: string;
}
