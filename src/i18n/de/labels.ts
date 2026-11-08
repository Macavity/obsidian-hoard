import type enLabels from '../en/labels';
import type { DeepPartial } from '../index';

export default {
	status: {
		Watching: 'Am Schauen',
		'Plan to watch': 'Geplant',
		Completed: 'Abgeschlossen',
		'To be released': 'Noch nicht erschienen',
		Dropped: 'Abgebrochen',
	},
	type: {
		Anime: 'Anime',
		Movie: 'Film',
		'TV Show': 'Serie',
		'Korean TV Show': 'Koreanische Serie',
		Animation: 'Animation',
	},
	readingStatus: {
		Reading: 'Am Lesen',
		Completed: 'Abgeschlossen',
		'Plan to Read': 'Geplant',
		'To be released': 'Noch nicht erschienen',
		Dropped: 'Abgebrochen',
	},
	gameStatus: {
		Playing: 'Am Spielen',
		'Not started': 'Nicht begonnen',
		Finished: 'Beendet',
		Dropped: 'Abgebrochen',
		'To be released': 'Noch nicht erschienen',
		TBA: 'Noch offen',
	},
	libraryType: {
		Book: 'Buch',
		Manga: 'Manga',
		Game: 'Spiel',
	},
	priority: {
		Low: 'Niedrig',
		Medium: 'Mittel',
		High: 'Hoch',
	},
} as const satisfies DeepPartial<typeof enLabels>;
