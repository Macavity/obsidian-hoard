
import type { OpenAddWizard } from '../../src/modules/add/exports';
import { vi } from 'vitest';
import { AirtimeTab } from '../../src/modules/airtime/ui/AirtimeTab';
import { AirtimeScheduleModal } from '../../src/modules/airtime/ui/AirtimeScheduleModal';
import { fakeSettings } from '../helpers/fakeSettings';
import type { AirtimeEntry } from '../../src/modules/airtime/domain/model';
import type { Game } from '../../src/modules/games/domain/model';
import type { Book, Manga } from '../../src/modules/reading/domain/model';
import type { HoardTitle } from '../../src/modules/watchlist/domain/model';
import { DEFAULT_SETTINGS } from '../../src/modules/settings/domain/settingsDefaults';

/** Modal constructor captures shared with the vi.mock factories of the airtime tests. */
export interface Captures {
	confirms: { message: string; onConfirm: () => void; extra?: { label: string; onClick: () => void } }[];
	finders: { items: { source: string; kind?: string; id: string; title: string; typeLabel: string }[]; onPick: (i: unknown) => void }[];
	readingModals: unknown[][];
	gameModals: unknown[][];
	forms: { form: unknown; opts: { onSave: () => Promise<void>; hint: (m: string) => string; timeNote: (time: string) => string } }[];
}

/** Where the spy dialogs record what the tab opened; `useCaptures` swaps in a test file's own arrays. */
export const captures: Captures = { confirms: [], finders: [], readingModals: [], gameModals: [], forms: [] };
export function useCaptures(own: Partial<Captures>): void {
	Object.assign(captures, own);
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

const pad = (n: number): string => String(n).padStart(2, '0');
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
		lookupDue: (id: string) => !w.titles.find((x) => x.id === id)?.posterUrl,
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
	const settingsService = fakeSettings({
		...DEFAULT_SETTINGS,
		types: [{ name: 'Anime', color: '#f00' }],
		coloredTypeBadges: w.colored ?? false,
		upcomingTrackerView: w.view ?? 'list',
		showHintBanners: false,
	});
	const api = {
		getAnimeScheduleByMalId: () => (w.animeThrows
			? Promise.reject(new Error('offline'))
			: Promise.resolve(w.anime ?? null)),
	};
	const posters = { clearQueue: () => {}, enqueue: () => Promise.resolve('') };
	const host = { markAirtimeHandled: rec('markAirtimeHandled'), getCardMinWidth: () => 150, isCardTextUnder: () => true };
	const modals = {
		openAddWizard: vi.fn<OpenAddWizard>(),
		openUpcomingFinder: (opts: { items: Captures['finders'][number]['items']; onSelect: (i: unknown) => void }) => {
			captures.finders.push({ items: opts.items, onPick: opts.onSelect });
		},
		// the recorded shape keeps the options at index 1, where the former constructor args had them
		openReadingSchedule: (opts: unknown) => { captures.readingModals.push([null, opts]); },
		openGameSchedule: (opts: unknown) => { captures.gameModals.push([null, opts]); },
		// the real dialog, so its form capture in the ScheduleForm mock keeps working
		openAirtimeSchedule: (opts: ConstructorParameters<typeof AirtimeScheduleModal>[1]) => {
			new AirtimeScheduleModal({} as never, opts).open();
		},
		confirm: (message: string, onConfirm: () => void, extra?: { label: string; onClick: () => void }) => {
			captures.confirms.push({ message, onConfirm, extra });
		},
	};
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new AirtimeTab(container, settingsService, dm as never, rdm, gdm as never, api, posters, host, modals, () => {});
	const priv = tab as unknown as Record<'resolveEntry' | 'openAddFlow' | 'startAddWithTitle' | 'openEditWatchSchedule', (...a: unknown[]) => unknown>;
	return { tab, priv, container, calls, dm, posters, settingsService, rdm, gdm, modals };
}
