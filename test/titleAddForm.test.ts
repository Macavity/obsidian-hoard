import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTitleAddForm } from '../src/modules/watchlist/ui/TitleAddForm';
import { fakeSettings } from './helpers/fakeSettings';
import { shownNotices } from './helpers/csvWizard';
import type { AddFormContext, AddKind, AddTarget } from '../src/modules/add/exports';
import type { AnimeSearchResult, HoardTitle, MaybeTitle, MediaSearchResult } from '../src/modules/watchlist/domain/model';

// noon UTC: the local calendar day is 2026-03-04 in every timezone the suite runs in
const NOW = '2026-03-04T12:00:00.000Z';

const TYPES = ['Anime', 'Movie', 'TV Show', 'Korean TV Show'];

const DARK: MediaSearchResult = {
	imdbId: 'tt5753856', title: 'Dark', mediaType: 'tv', episodes: 3, episodeDuration: 50, releaseDate: '2017-12-01',
	url: 'https://example.test/dark', seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }], posterUrl: 'https://img.test/dark.jpg',
};

const FRIEREN: AnimeSearchResult = {
	malId: 0, anilistId: 154587, title: 'Frieren', episodes: 28, duration: 24, releaseDate: '2023-09-29',
	url: 'https://anilist.co/anime/154587', seasons: [{ name: 'Season 1', episodes: 28, offset: 0 }], trailerUrl: 'https://yt.test/f',
};

interface Setup {
	kind?: AddKind;
	target?: AddTarget;
	result?: MediaSearchResult | AnimeSearchResult | null;
	query?: string;
	types?: string[];
	existing?: Array<{ title: string }>;
	autoFinish?: boolean;
	activeApi?: string;
}

function setup(o: Setup = {}) {
	const added: HoardTitle[] = [];
	const maybes: MaybeTitle[] = [];
	const titles = {
		getTitles: () => o.existing ?? [],
		getGroups: () => [{ id: 'g1', name: 'Saga' }],
		generateId: (title: string) => `t-${title}`,
		generateGroupId: (name: string) => `g-${name}`,
		generateMaybeId: (title: string) => `m-${title}`,
		// a copy: the pin is what was handed over, whatever happens to the object afterwards
		addTitle: vi.fn((entry: HoardTitle) => { added.push(structuredClone(entry)); return Promise.resolve(); }),
		addMaybeTitle: vi.fn((entry: MaybeTitle) => { maybes.push(entry); return Promise.resolve(); }),
		addTitleToGroup: vi.fn(() => Promise.resolve()),
		addGroup: vi.fn(() => Promise.resolve()),
		recordLookup: vi.fn(),
		updateCommunityRating: vi.fn(),
	};
	const settings = fakeSettings({
		types: (o.types ?? TYPES).map((name) => ({ name, color: '#000' })),
		statuses: [{ name: 'Plan to watch' }, { name: 'Watching' }, { name: 'Completed' }],
		priorities: [{ name: 'Medium' }, { name: 'High' }],
		setFinishDateAutomatically: o.autoFinish ?? true,
		activeApi: o.activeApi ?? 'Cinemeta',
	});
	const api = {
		hasOmdbKey: () => false,
		hasTmdbKey: () => false,
		getCinemetaDetails: vi.fn(() => Promise.resolve(null)),
		fetchCommunityRating: vi.fn(() => Promise.resolve(null)),
	};
	const done = vi.fn();
	const host = document.createElement('div');
	document.body.appendChild(host);
	const kind = o.kind ?? 'series';
	const ctx: AddFormContext = {
		kind,
		hit: o.result ? { kind, id: 'x', title: 'x', meta: '', fallbackIcon: '', inLibrary: null } : null,
		query: o.query ?? 'Dark',
		target: o.target ?? 'library',
		back: vi.fn(),
		done,
	};
	const handle = mountTitleAddForm(host, settings as never, titles as never, api as never, ctx, o.result ?? null);
	const submit = (): void => host.querySelector<HTMLButtonElement>('.hoard-modal__btn-row .hoard-btn--primary')!.click();
	const titleInput = (): HTMLInputElement => host.querySelector<HTMLInputElement>('input[type=text]')!;
	const selects = (): HTMLSelectElement[] => Array.from(host.querySelectorAll('select'));
	const choose = (option: string): void => {
		const select = selects().find((el) => Array.from(el.options).some((o) => o.value === option))!;
		select.value = option;
		select.dispatchEvent(new Event('change'));
	};
	const ready = (): Promise<void> => vi.waitFor(() => expect(host.querySelector('.hoard-modal__btn-row')).not.toBeNull());
	return { host, titles, added, maybes, settings, api, done, handle, submit, titleInput, choose, ready };
}

beforeEach(() => {
	// without fake timers this mocks Date only
	vi.setSystemTime(NOW);
	shownNotices.length = 0;
});
afterEach(() => { vi.useRealTimers(); });

describe('TitleAddForm library target', () => {
	it('manual series form saves Source Type Series and Type TV Show', async () => {
		const s = setup({ result: null });
		expect(s.titleInput().value).toBe('Dark');
		s.submit();
		await vi.waitFor(() => expect(s.done).toHaveBeenCalled());
		expect(s.added[0]).toMatchObject({ id: 't-Dark', title: 'Dark', type: 'TV Show', sourceType: 'Series', status: 'Plan to watch', priority: 'Medium' });
		expect(s.done).toHaveBeenCalledWith({ kind: 'series', id: 't-Dark' });
	});

	it.each([['anime', 'Anime', 'Anime'], ['movie', 'Movie', 'Movie']] as const)(
		'manual %s form saves Source Type %s',
		async (kind, sourceType, type) => {
			const s = setup({ kind, result: null });
			s.submit();
			await vi.waitFor(() => expect(s.added).toHaveLength(1));
			expect(s.added[0]).toMatchObject({ sourceType, type });
		},
	);

	it('type falls back to the first type when TV Show was deleted', async () => {
		const s = setup({ result: null, types: ['Film', 'Doku'] });
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]!.type).toBe('Film');
	});

	it('saves the type chosen in the select', async () => {
		const s = setup({ result: null });
		s.choose('Korean TV Show');
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]!.type).toBe('Korean TV Show');
	});

	it('refuses an empty name', () => {
		const s = setup({ result: null, query: '  ' });
		s.submit();
		expect(s.added).toHaveLength(0);
		expect(shownNotices.length).toBeGreaterThan(0);
		expect(s.done).not.toHaveBeenCalled();
	});

	it('duplicate name asks before adding', async () => {
		const s = setup({ result: null, existing: [{ title: 'dark' }] });
		s.submit();
		expect(s.titles.addTitle).not.toHaveBeenCalled();
		const warning = s.host.querySelector<HTMLElement>('.hoard-modal__duplicate-warning')!;
		expect(warning).not.toBeNull();
		warning.querySelector<HTMLButtonElement>('.hoard-btn--primary')!.click();
		await vi.waitFor(() => expect(s.done).toHaveBeenCalledOnce());
		expect(s.added).toHaveLength(1);
	});

	it('builds the complete title from a picked media hit', async () => {
		const s = setup({ result: DARK });
		await s.ready();
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]).toStrictEqual({
			id: 't-Dark', title: 'Dark', type: 'TV Show', sourceType: 'Series', status: 'Plan to watch', priority: 'Medium', review: '',
			rating: 0, notes: '', dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW, totalEpisodes: 3,
			episodeDuration: 50, releaseDate: '2017-12-01', externalLink: 'https://example.test/dark',
			seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }], watchedEpisodes: [], favorite: false,
			posterUrl: 'https://img.test/dark.jpg', trailerUrl: '', manualTrailerUrl: '',
		});
	});

	it('carries the anime id and trailer of a picked anime hit', async () => {
		const s = setup({ kind: 'anime', result: FRIEREN });
		await s.ready();
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]).toMatchObject({ title: 'Frieren', anilistId: 154587, trailerUrl: 'https://yt.test/f', sourceType: 'Anime' });
		expect(s.added[0]).not.toHaveProperty('malId');
		expect(s.titles.recordLookup).toHaveBeenCalledWith('t-Frieren', 'trailer', { status: 'found', value: 'https://yt.test/f' });
	});

	it('records a trailer the source did not have, once the note exists', async () => {
		const s = setup({ kind: 'anime', result: { ...FRIEREN, trailerUrl: undefined } });
		await s.ready();
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]!.trailerUrl).toBe('');
		expect(s.titles.recordLookup).toHaveBeenCalledWith('t-Frieren', 'trailer', { status: 'notfound' });
	});

	it('records nothing for a trailer that was never fetched', async () => {
		const s = setup({ result: null });
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.titles.recordLookup).not.toHaveBeenCalled();
	});

	it('ticks every episode and sets the finish date when added as Completed', async () => {
		const s = setup({ result: DARK });
		await s.ready();
		s.choose('Completed');
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]).toMatchObject({ status: 'Completed', watchedEpisodes: [1, 2, 3], dateFinished: '2026-03-04' });
	});

	it('ticks every episode without a finish date when the setting is off', async () => {
		const s = setup({ result: DARK, autoFinish: false });
		await s.ready();
		s.choose('Completed');
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.added[0]).toMatchObject({ watchedEpisodes: [1, 2, 3], dateFinished: null });
	});

	it('does not touch the settings: no last-used type is remembered', async () => {
		const s = setup({ result: null });
		s.submit();
		await vi.waitFor(() => expect(s.added).toHaveLength(1));
		expect(s.settings.update).not.toHaveBeenCalled();
	});

	it('starts the community rating fetch in the background', async () => {
		const s = setup({ result: null });
		s.submit();
		await vi.waitFor(() => expect(s.api.fetchCommunityRating).toHaveBeenCalledOnce());
	});

	it('adds the title to a new group', async () => {
		const s = setup({ result: null });
		const newGroup = Array.from(s.host.querySelectorAll<HTMLInputElement>('input[type=text]')).pop()!;
		newGroup.value = 'Mystery';
		newGroup.dispatchEvent(new Event('input'));
		s.submit();
		await vi.waitFor(() => expect(s.titles.addGroup).toHaveBeenCalledOnce());
		expect(s.titles.addGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mystery', titleIds: ['t-Dark'] }));
	});

	it('shows nothing after the handle is destroyed', () => {
		const s = setup({ result: null });
		s.handle.destroy();
		expect(s.host.children).toHaveLength(0);
	});
});

describe('TitleAddForm maybe target', () => {
	it('maybe target saves a Maybe note with Source Type', async () => {
		const s = setup({ target: 'maybe', result: null });
		s.choose('Korean TV Show');
		s.submit();
		await vi.waitFor(() => expect(s.maybes).toHaveLength(1));
		expect(s.maybes[0]).toMatchObject({ id: 'm-Dark', title: 'Dark', type: 'Korean TV Show', sourceType: 'Series' });
		expect(s.titles.addTitle).not.toHaveBeenCalled();
		expect(s.done).toHaveBeenCalledWith({ kind: 'series', id: 'm-Dark' });
	});

	it('takes the values of the picked hit', async () => {
		const s = setup({ target: 'maybe', result: DARK });
		await s.ready();
		s.submit();
		await vi.waitFor(() => expect(s.maybes).toHaveLength(1));
		expect(s.maybes[0]).toMatchObject({ releaseDate: '2017-12-01', externalLink: 'https://example.test/dark', totalEpisodes: 3, episodeDuration: 50 });
	});

	it('has no group, rating or duplicate fields', () => {
		const s = setup({ target: 'maybe', result: null, existing: [{ title: 'Dark' }] });
		expect(s.host.querySelector('.hoard-star-rating--row')).toBeNull();
		s.submit();
		expect(s.host.querySelector('.hoard-modal__duplicate-warning')).toBeNull();
	});

	it('refuses an empty name', () => {
		const s = setup({ target: 'maybe', result: null, query: '' });
		s.submit();
		expect(s.maybes).toHaveLength(0);
		expect(shownNotices.length).toBeGreaterThan(0);
	});
});
