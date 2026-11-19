export type AirtimeRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';

/** Manual Upcoming schedule stored on the entry's note. Reading reuses season/episode for volume/chapter. */
export interface EntryAirtime {
	recurrence: AirtimeRecurrence;
	/** 0–6 for weekly, 1–31 for monthly */
	day?: number;
	/** HH:MM */
	time?: string;
	season?: number;
	episode?: number;
	/** YYYY-MM-DD */
	acknowledged?: string;
}

export interface AirtimeSchedule {
	recurrence: AirtimeRecurrence;
	releaseDate?: string;   // YYYY-MM-DD, for 'once'
	releaseTime?: string;   // HH:MM, for any recurrence
	dayOfWeek?: number;     // 0=Sunday … 6=Saturday, for 'weekly'
	dayOfMonth?: number;    // 1–31, for 'monthly'
}

export interface AirtimeEntry {
	id: string;
	/** watchlist: a HoardTitle id; reading: a Book/Manga id; game: a Game id */
	titleId: string;
	/** absent or 'watchlist' = watch title, 'reading' = Book/Manga, 'game' = Game */
	source?: 'watchlist' | 'reading' | 'game';
	/** Only set when source === 'reading'. */
	readingKind?: 'book' | 'manga';
	schedule: AirtimeSchedule;
	/** watch: current season. reading reuses this slot for the current volume. */
	currentSeason?: number;
	/**
	 * watch: current episode. reading reuses this slot for the current chapter (this is
	 * what auto-increments).
	 */
	currentEpisode?: number;
	/**
	 * total episodes, for final-episode detection (synced from Watchlist). reading reuses
	 * it for total chapters; 0 or 1 marks a single release (movie/book).
	 */
	totalEpisodes?: number;
	/** total seasons (informational); reading reuses it for total volumes */
	totalSeasons?: number;
	/** YYYY-MM-DD: set when you tick an episode, so the countdown resets to the next one. */
	lastAcknowledgedDate?: string;
	dateAdded: string;
}

// Roles the airtime module needs; the watchlist's DataManager stores the entries of every medium.


