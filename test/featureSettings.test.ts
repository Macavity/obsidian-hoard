import { describe, expect, it } from 'vitest';
import { readColumns, readGamesSettings, readReadingSettings } from '../src/featureSettings';
import { DEFAULT_READING_SETTINGS, DEFAULT_READING_STATUS_COLORS, defaultGamesSettings } from '../src/types';

describe('readGamesSettings', () => {
	const defaults = defaultGamesSettings();

	it('gives the defaults for nothing stored', () => {
		expect(readGamesSettings({}, defaults)).toEqual(defaults);
	});

	it('keeps well-formed tags and drops the rest; an emptied required list gives the default', () => {
		const s = readGamesSettings({
			statuses: [{ name: 'A', color: '#fff' }, 5, { name: 3 }], types: [7], platforms: [null],
			defaultStatus: 4,
		}, defaults);
		expect(s.statuses).toEqual([{ name: 'A', color: '#fff' }]);
		expect(s.types).toEqual(defaults.types);
		expect(s.platforms).toEqual([]);
		expect(s.defaultStatus).toBe(defaults.defaultStatus);
	});

	it('reads the rows layout and the saved filter preset', () => {
		const preset = { genreExclude: ['RPG', 3], statusExclude: [], ratingExclude: [], priorityExclude: [], platformExclude: [], groupExclude: [], wishlistOnly: true, favoritesOnly: 'yes' };
		const s = readGamesSettings({ rowsLayout: [{ id: 'favorites', enabled: false }, { id: 'x' }, 3], savedFilterPreset: preset }, defaults);
		expect(s.rowsLayout).toEqual([{ id: 'favorites', enabled: false }, { id: 'x', enabled: true }]);
		expect(s.savedFilterPreset).toEqual({ ...preset, genreExclude: ['RPG'], favoritesOnly: undefined });
		expect(readGamesSettings({ savedFilterPreset: null }, defaults).savedFilterPreset).toBeNull();
		expect(readGamesSettings({ savedFilterPreset: 'x', rowsLayout: 'x' }, defaults)).toEqual(defaults);
	});
});

describe('readReadingSettings', () => {
	it('gives the defaults, with every status colour, for nothing stored', () => {
		expect(readReadingSettings({})).toEqual({ ...DEFAULT_READING_SETTINGS, statusColors: DEFAULT_READING_STATUS_COLORS });
	});

	it('replaces the removed On Hold status and keeps a stored colour', () => {
		const s = readReadingSettings({ defaultStatus: 'On Hold', statusColors: { Reading: '#123456', Completed: 5 }, defaultSubTab: 'manga', mangaCustomFieldStyle: 'border' });
		expect(s.defaultStatus).toBe('Plan to Read');
		expect(s.statusColors).toEqual({ ...DEFAULT_READING_STATUS_COLORS, Reading: '#123456' });
		expect(s.defaultSubTab).toBe('manga');
		expect(s.mangaCustomFieldStyle).toBe('border');
		expect(s.bookCustomFieldStyle).toBe('fill');
	});

	it('reads saved filters per sub-tab and the rows layout', () => {
		const s = readReadingSettings({
			savedFilters: { books: { name: 'B', statusInclude: ['Reading', 'Nope'], ratingMode: 'has' }, manga: { name: 3 } },
			rowsLayout: [{ id: 'favorites' }],
			defaultSubTab: 'comics',
		});
		expect(s.savedFilters).toEqual({ books: { name: 'B', statusInclude: ['Reading'], ratingMode: 'has' } });
		expect(s.rowsLayout).toEqual([{ id: 'favorites', enabled: true }]);
		expect(s.defaultSubTab).toBeUndefined();
		expect(readReadingSettings({ savedFilters: 'x' }).savedFilters).toBeUndefined();
	});
});

describe('readColumns', () => {
	it('keeps the columns with an id and a name and fills the rest', () => {
		expect(readColumns([
			{ id: 'c1', name: 'Format', type: 'select', options: ['a', 3], color: '#111111' },
			{ id: 'c2', name: 'Pages', type: 'bad', color: '' },
			{ name: 'no id' }, 'x',
		])).toEqual([
			{ id: 'c1', name: 'Format', type: 'select', options: ['a'], color: '#111111' },
			{ id: 'c2', name: 'Pages', type: 'text', options: [], color: '#5F5E5A' },
		]);
		expect(readColumns('x')).toEqual([]);
	});
});
