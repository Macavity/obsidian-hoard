
import { AirtimeTab } from '../../src/AirtimeTab';
import type HoardPlugin from '../../src/main';
import type { AirtimeEntry, Book, Game, HoardTitle, Manga } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';

/** Modal constructor captures shared with the vi.mock factories of the airtime tests. */
export interface Captures {
	confirms: { message: string; onConfirm: () => void; extra?: { label: string; onClick: () => void } }[];
	finders: { items: { source: string; kind?: string; id: string; title: string; typeLabel: string }[]; onPick: (i: unknown) => void }[];
	readingModals: unknown[][];
	gameModals: unknown[][];
	forms: { form: unknown; opts: { onSave: () => Promise<void>; hint: (m: string) => string } }[];
}

export interface World {
	entries: AirtimeEntry[];
	titles: HoardTitle[];
	books: Book[];
	manga: Manga[];
	games: Game[];
	tracked: boolean;
	clearsDate: boolean;
	view?: 'list' | 'cards';
	colored?: boolean;
	anime?: { dayOfWeek: number; time: string } | null;
	animeThrows?: boolean;
}

export const pad = (n: number): string => String(n).padStart(2, '0');
export const isoOffset = (days: number): string => {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const title = (over: Partial<HoardTitle> = {}): HoardTitle =>
	({
		id: 't1', title: 'Show', type: 'Anime', status: 'Watching', watchedEpisodes: [], totalEpisodes: 12, seasons: [],
		externalLink: 'https://example.test/show', releaseDate: null, posterUrl: '', ...over,
	}) as unknown as HoardTitle;

export const entry = (over: Partial<AirtimeEntry> = {}): AirtimeEntry =>
	({ id: 'e1', titleId: 't1', schedule: { recurrence: 'daily' }, dateAdded: '2026-01-01', ...over });

export function newWorld(over: Partial<World> = {}): World {
	return { entries: [], titles: [], books: [], manga: [], games: [], tracked: false, clearsDate: false, ...over };
}

export function makeTab(w: World) {
	const calls: string[] = [];
	const rec = (name: string) => (...a: unknown[]) => { calls.push(`${name}:${JSON.stringify(a)}`); return Promise.resolve(); };
	const dm = {
		getAirtimeEntries: () => w.entries,
		getTitles: () => w.titles,
		getTitle: (id: string) => w.titles.find((x) => x.id === id),
		getMaybeTitles: () => [],
		isAiringTracked: () => w.tracked,
		removeClearsReleaseDate: () => w.clearsDate,
		removeAirtimeEntry: rec('removeAirtimeEntry'),
		removeAirtimeEntriesBatch: rec('removeBatch'),
		tickAirtimeEntry: rec('tickAirtimeEntry'),
		updateAirtimeEntry: rec('updateAirtimeEntry'),
		addAirtimeEntry: rec('addAirtimeEntry'),
		updateTitle: rec('updateTitle'),
		updatePosterUrl: rec('updatePosterUrl'),
		generateAirtimeId: (id: string) => `air-${id}`,
		generateGameAirtimeId: (id: string) => `airg-${id}`,
		generateReadingAirtimeId: (id: string) => `airr-${id}`,
	};
	const rdm = {
		getBooks: () => w.books,
		getMangaList: () => w.manga,
		getBook: (id: string) => w.books.find((x) => x.id === id),
		getManga: (id: string) => w.manga.find((x) => x.id === id),
		updateBook: rec('updateBook'),
		updateManga: rec('updateManga'),
	};
	const gdm = {
		getGames: () => w.games,
		getGame: (id: string) => w.games.find((x) => x.id === id),
		getSettings: () => ({ defaultStatus: '', types: [{ name: 'RPG', color: '#123456' }] }),
		updateGame: rec('updateGame'),
	};
	const plugin = {
		app: {},
		settings: {
			...DEFAULT_SETTINGS,
			types: [{ name: 'Anime', color: '#f00' }],
			coloredTypeBadges: w.colored ?? false,
			upcomingTrackerView: w.view ?? 'list',
			showHintBanners: false,
		},
		readingDataManager: rdm,
		gameDataManager: gdm,
		apiService: {
			getAnimeScheduleByMalId: () => (w.animeThrows
				? Promise.reject(new Error('offline'))
				: Promise.resolve(w.anime ?? null)),
		},
		posterService: { clearQueue: () => {}, enqueue: () => Promise.resolve('') },
		markAirtimeHandled: rec('markAirtimeHandled'),
		saveSettings: rec('saveSettings'),
		getCardMinWidth: () => 150,
		isCardTextUnder: () => true,
	};
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new AirtimeTab(container, plugin as unknown as HoardPlugin, dm as never, () => {});
	const priv = tab as unknown as Record<'resolveEntry' | 'openAddFlow' | 'startAddWithTitle' | 'openEditWatchSchedule', (...a: unknown[]) => unknown>;
	return { tab, priv, container, calls, dm, plugin, rdm, gdm };
}
