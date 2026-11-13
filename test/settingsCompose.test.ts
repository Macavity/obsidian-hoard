import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { createFakeApp } from './fakes/fakeApp';
import { LocalStore } from '../src/storage/LocalStore';
import { SHARED_SETTING_KEYS, SharedConfigStore } from '../src/storage/SharedConfigStore';
import { SECRET_KEYS } from '../src/storage/SecretStore';
import { VaultLayout } from '../src/storage/VaultLayout';
import { composeSettings, persistSettings } from '../src/settingsSplit';
import { DEFAULT_SETTINGS, LAST_USED_TYPE_SENTINEL } from '../src/types';
import { STORED } from './settingsCompose.fixture';

type Loose = Record<string, unknown>;

/** Composes from loosely typed stores and hands the result back loosely typed, for odd stored values. */
const compose = (local: Loose, shared: Loose = {}, secrets: Loose = {}): Loose =>
	composeSettings(local, shared, secrets) as unknown as Loose;

const DEFAULT_TYPES = [
	{ name: 'Anime', color: '#1D9E75' },
	{ name: 'Movie', color: '#378ADD' },
	{ name: 'TV Show', color: '#BA7517' },
	{ name: 'Korean TV Show', color: '#7F77DD' },
	{ name: 'Animation', color: '#D85A30' },
];
const DEFAULT_STATUSES = [
	{ name: 'Watching', color: '#1D9E75' },
	{ name: 'Plan to watch', color: '#00A9A5' },
	{ name: 'Completed', color: '#378ADD' },
	{ name: 'To be released', color: '#E8873A' },
	{ name: 'Dropped', color: '#E24B4A' },
];
const DEFAULT_RATING = [
	{ label: 'Poor', color: '#E24B4A' },
	{ label: 'Fair', color: '#E28C3C' },
	{ label: 'Good', color: '#378ADD' },
	{ label: 'Great', color: '#1D9E75' },
	{ label: 'Masterpiece', color: '#7F77DD' },
];
const DEFAULT_READING_COLORS = { manga: '#D4537E', book: '#D85A30' };
const DEFAULT_LIST_FILTERS = {
	typeExclude: [],
	statusExclude: [],
	groupExclude: [],
	ratingExclude: [],
	priorityExclude: [],
	sort: 'dateAdded',
	sortDir: 'desc',
	secondSort: 'none',
	secondSortDir: 'asc',
};
const DEFAULT_CARD_TEXT = { watchlist: 'under', games: 'under', reading: 'under', upcoming: 'under' };

describe('composeSettings: complete settings', () => {
	it('gives the defaults when nothing is stored', () => {
		expect(composeSettings({}, {})).toEqual(DEFAULT_SETTINGS);
	});

	it('hands valid stored settings back unchanged, falsy values included', () => {
		expect(composeSettings(STORED as unknown as Loose, {})).toStrictEqual(STORED);
	});

	it('gives the same result when the settings come split over the three stores', () => {
		const all = Object.entries(STORED as unknown as Loose);
		const secretKeys = SECRET_KEYS as readonly string[];
		const shared = Object.fromEntries(all.filter(([k]) => SHARED_SETTING_KEYS.includes(k)));
		const secrets = Object.fromEntries(all.filter(([k]) => secretKeys.includes(k)));
		const local = Object.fromEntries(all.filter(([k]) => !SHARED_SETTING_KEYS.includes(k) && !secretKeys.includes(k)));
		expect(Object.keys(shared).length).toBeGreaterThan(5);
		expect(Object.keys(secrets)).toHaveLength(9);
		expect(compose(local, shared, secrets)).toStrictEqual(STORED);
	});
});

describe('composeSettings: precedence', () => {
	it('lets the base win over secrets and secrets over data.json', () => {
		expect(compose({ halfStarRatings: false }, { halfStarRatings: true }).halfStarRatings).toBe(true);
		expect(compose({ tmdbApiKey: 'LOCAL' }, {}, { tmdbApiKey: 'SECRET' }).tmdbApiKey).toBe('SECRET');
		expect(compose({ tmdbApiKey: 'LOCAL' }).tmdbApiKey).toBe('LOCAL');
	});

	it('never takes a secret key from the base', () => {
		const s = compose({ rawgApiKey: 'LOCAL' }, { rawgApiKey: 'BASE', steamId: 'BASE', jikanBaseUrl: 'https://base.example.org' });
		expect(s.rawgApiKey).toBe('LOCAL');
		expect(s.steamId).toBe('');
		expect(s.jikanBaseUrl).toBe('');
	});

	it('drops the removed folder settings and keeps a key it does not know', () => {
		const s = compose({ rootFolder: 'X', customListsFolder: 'Y', futureKey: 1 }, { rootFolder: 'Z' });
		expect('rootFolder' in s).toBe(false);
		expect('customListsFolder' in s).toBe(false);
		expect(s.futureKey).toBe(1);
	});

	it('leaves the three stores as they were', () => {
		const local = { statuses: [{ name: 'Plan to watch', color: '#888780' }], readingTypeColors: { manga: '' }, rootFolder: 'X' };
		const shared = { types: [{ name: 'T', color: '#111111' }], tmdbApiKey: 'BASE' };
		const secrets = { omdbApiKey: 'O' };
		const before = structuredClone({ local, shared, secrets });
		compose(local, shared, secrets);
		expect({ local, shared, secrets }).toStrictEqual(before);
	});
});

describe('composeSettings: checked values', () => {
	it.each(['european', 'american', 'iso'])('keeps the date format %s', (dateFormat) => {
		expect(compose({ dateFormat }).dateFormat).toBe(dateFormat);
	});

	it('falls back to the european date format', () => {
		expect(compose({ dateFormat: 'x' }).dateFormat).toBe('european');
		expect(compose({ dateFormat: undefined }).dateFormat).toBe('european');
	});

	it('keeps the list view and turns the removed cards view into rows', () => {
		expect(compose({ defaultWatchlistView: 'list' }).defaultWatchlistView).toBe('list');
		expect(compose({ defaultWatchlistView: 'cards' }).defaultWatchlistView).toBe('rows');
	});

	it('does not check the colour theme', () => {
		expect(compose({ colorTheme: 'nope' }).colorTheme).toBe('nope');
	});

	it.each([[[]], [null]])('gives the default lists for %j', (empty) => {
		const s = compose({ types: empty, statuses: empty, reviews: empty, priorities: empty, seasonPalette: empty });
		expect(s.types).toEqual(DEFAULT_TYPES);
		expect(s.statuses).toEqual(DEFAULT_STATUSES);
		expect(s.reviews).toEqual([
			{ name: 'Nah', color: '#E24B4A' },
			{ name: 'Awesome', color: '#1D9E75' },
			{ name: 'Marvelous', color: '#7F77DD' },
		]);
		expect(s.priorities).toEqual([
			{ name: 'Low', color: '#888780' },
			{ name: 'Medium', color: '#3b82f6' },
			{ name: 'High', color: '#E24B4A' },
		]);
		expect(s.seasonPalette).toEqual(['#1D9E75', '#BA7517', '#378ADD', '#7F77DD', '#D85A30', '#D4537E', '#639922', '#888780']);
	});

	it('resets a rating system that is not five well-formed tiers', () => {
		const tier = { label: 'a', color: 'b' };
		expect(compose({ ratingSystem: [tier, tier, tier, tier] }).ratingSystem).toEqual(DEFAULT_RATING);
		expect(compose({ ratingSystem: [tier, tier, tier, tier, tier, tier] }).ratingSystem).toEqual(DEFAULT_RATING);
		expect(compose({ ratingSystem: [tier, null, tier, tier, tier] }).ratingSystem).toEqual(DEFAULT_RATING);
		expect(compose({ ratingSystem: [tier, { label: 5, color: 'b' }, tier, tier, tier] }).ratingSystem).toEqual(DEFAULT_RATING);
		expect(compose({ ratingSystem: [tier, { label: 'a' }, tier, tier, tier] }).ratingSystem).toEqual(DEFAULT_RATING);
		expect(compose({ ratingSystem: null }).ratingSystem).toEqual(DEFAULT_RATING);
		expect(compose({ ratingSystem: 'abc' }).ratingSystem).toEqual(DEFAULT_RATING);
	});

	it('keeps five well-formed tiers', () => {
		expect(compose({ ratingSystem: STORED.ratingSystem }).ratingSystem).toEqual(STORED.ratingSystem);
	});

	it('fills a missing or empty reading type colour', () => {
		expect(compose({ readingTypeColors: { manga: '' } }).readingTypeColors).toEqual(DEFAULT_READING_COLORS);
		expect(compose({ readingTypeColors: { book: '#222222' } }).readingTypeColors).toEqual({ manga: '#D4537E', book: '#222222' });
		expect(compose({ readingTypeColors: null }).readingTypeColors).toEqual(DEFAULT_READING_COLORS);
		expect(compose({ readingTypeColors: { manga: '#111111', book: '#222222', x: 1 } }).readingTypeColors)
			.toEqual({ manga: '#111111', book: '#222222', x: 1 });
	});

	it('merges saved list filters over the defaults, but not the games filters', () => {
		expect(compose({ listFilters: { sort: 'title', favoritesOnly: true } }).listFilters)
			.toEqual({ ...DEFAULT_LIST_FILTERS, sort: 'title', favoritesOnly: true });
		expect(compose({ gamesFilters: { sort: 'title' } }).gamesFilters).toEqual({ sort: 'title' });
	});

	it('merges saved card text styles over the defaults', () => {
		expect(compose({ cardTextStyles: { games: 'inside' } }).cardTextStyles).toEqual({ ...DEFAULT_CARD_TEXT, games: 'inside' });
		expect(compose({ cardTextStyles: null }).cardTextStyles).toEqual(DEFAULT_CARD_TEXT);
	});

	it('normalises the rows layout', () => {
		const rowsLayout = [{ id: 'byStatus', enabled: true }, { id: 'nope', enabled: true }, { id: 'byType' }];
		expect(compose({ rowsLayout }).rowsLayout).toEqual([
			{ id: 'byStatus', enabled: true },
			{ id: 'byType', enabled: false },
			{ id: 'favorites', enabled: true },
			{ id: 'recommended', enabled: true },
			{ id: 'recentlyAdded', enabled: true },
			{ id: 'recentlyWatched', enabled: true },
			{ id: 'groups', enabled: true },
			{ id: 'recentlyReleased', enabled: true },
		]);
	});
});

describe('composeSettings: status migrations', () => {
	const released = { name: 'To be released', color: '#E8873A' };

	it('turns the old grey of Plan to watch into teal and leaves any other colour', () => {
		expect(compose({ statuses: [{ name: 'Plan to watch', color: '#888780' }, released] }).statuses)
			.toEqual([{ name: 'Plan to watch', color: '#00A9A5' }, released]);
		expect(compose({ statuses: [{ name: 'Plan to watch', color: '#123456' }, released] }).statuses)
			.toEqual([{ name: 'Plan to watch', color: '#123456' }, released]);
		expect(compose({ statuses: [{ name: 'Watching', color: '#888780' }, released] }).statuses)
			.toEqual([{ name: 'Watching', color: '#888780' }, released]);
	});

	it('inserts To be released after Completed', () => {
		const statuses = [{ name: 'Watching', color: '#1' }, { name: 'Completed', color: '#2' }, { name: 'Dropped', color: '#3' }];
		expect(compose({ statuses }).statuses).toEqual([
			{ name: 'Watching', color: '#1' },
			{ name: 'Completed', color: '#2' },
			released,
			{ name: 'Dropped', color: '#3' },
		]);
	});

	it('appends To be released when there is no Completed', () => {
		expect(compose({ statuses: [{ name: 'Watching', color: '#1' }] }).statuses)
			.toEqual([{ name: 'Watching', color: '#1' }, released]);
	});

	it('does not add To be released twice and keeps its stored colour', () => {
		const statuses = [{ name: 'To be released', color: '#ABCDEF' }, { name: 'Completed', color: '#2' }];
		expect(compose({ statuses }).statuses).toEqual(statuses);
	});

	it('migrates statuses that come from the base', () => {
		expect(compose({ statuses: [{ name: 'L', color: '#1' }] }, { statuses: [{ name: 'S', color: '#2' }] }).statuses)
			.toEqual([{ name: 'S', color: '#2' }, released]);
	});
});

describe('composeSettings: stored values of the wrong kind (as today)', () => {
	it('backfills five keys when they are undefined and leaves any other undefined', () => {
		const s = compose({
			animeApiSource: undefined, typeApiMapping: undefined, showUpcomingStatusBar: undefined,
			defaultAddType: undefined, lastAddedType: undefined, colorTheme: undefined, cardSize: undefined,
		});
		expect(s.animeApiSource).toBe('jikan');
		expect(s.typeApiMapping).toEqual({});
		expect(s.showUpcomingStatusBar).toBe(true);
		expect(s.defaultAddType).toBe(LAST_USED_TYPE_SENTINEL);
		expect(s.lastAddedType).toBe('');
		expect(s.colorTheme).toBeUndefined();
		expect(s.cardSize).toBeUndefined();
	});

	it('leaves null as it is', () => {
		const s = compose({
			animeApiSource: null, typeApiMapping: null, showUpcomingStatusBar: null,
			defaultAddType: null, lastAddedType: null, listFilters: null,
		});
		for (const key of ['animeApiSource', 'typeApiMapping', 'showUpcomingStatusBar', 'defaultAddType', 'lastAddedType', 'listFilters']) {
			expect(s[key]).toBeNull();
		}
	});

	it('lets text through where a list belongs, and breaks on the statuses', () => {
		expect(compose({ types: 'abc' }).types).toBe('abc');
		expect(() => compose({ statuses: 'abc' })).toThrow(TypeError);
	});

	it('lets a value of another kind through', () => {
		const s = compose({ cardSize: '2', showHintBanners: 'yes', gamesFilters: [], customListTabOrder: {} });
		expect(s.cardSize).toBe('2');
		expect(s.showHintBanners).toBe('yes');
		expect(s.gamesFilters).toEqual([]);
		expect(s.customListTabOrder).toEqual({});
	});

	it('keeps a reading type colour that is no text', () => {
		expect(compose({ readingTypeColors: { manga: 5, book: '#222222' } }).readingTypeColors).toEqual({ manga: 5, book: '#222222' });
	});
});

describe('composeSettings and persistSettings', () => {
	it('keeps a key it does not know in data.json', async () => {
		const f = createFakeApp({ 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		const local = new LocalStore(f.plugin);
		await local.load();
		const layout = new VaultLayout('W', () => []);
		const shared = new SharedConfigStore(f.app, () => layout, { parse, stringify });
		await shared.load();
		local.data.settings = { futureKey: 1, cardSize: 2 };
		const settings = composeSettings(local.data.settings, shared.get().settings);
		await persistSettings(settings, local, shared);
		expect(local.data.settings.futureKey).toBe(1);
		expect(local.data.settings.cardSize).toBe(2);
	});
});
