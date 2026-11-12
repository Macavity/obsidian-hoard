import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildImportedTitle, missingTypeNames } from '../src/CsvModal';
import { mapImportRows } from '../src/csv/CsvModalBase';

describe('buildImportedTitle', () => {
	it('fills defaults for a bare entry', () => {
		const t = buildImportedTitle({ title: '  Foo ' }, 'id1', undefined);
		expect(t).toMatchObject({
			id: 'id1', title: 'Foo', type: 'Anime', status: 'Plan to watch', priority: 'Medium',
			rating: 0, notes: '', totalEpisodes: 0, episodeDuration: 0, externalLink: '',
			dateStarted: null, dateFinished: null, releaseDate: null, favorite: false,
		});
		expect(t.manualStudio).toBeUndefined();
	});

	it('uses the first configured type when the entry has none', () => {
		expect(buildImportedTitle({ title: 'A' }, 'i', 'Series').type).toBe('Series');
		expect(buildImportedTitle({ title: 'A', type: ' Movie ' }, 'i', 'Series').type).toBe('Movie');
	});

	it('marks all episodes watched for Completed with episodes', () => {
		const t = buildImportedTitle({ title: 'A', status: 'Completed', totalEpisodes: 3 }, 'i', undefined);
		expect(t.watchedEpisodes).toEqual([1, 2, 3]);
		const none = buildImportedTitle({ title: 'A', status: 'Completed' }, 'i', undefined);
		expect(none.watchedEpisodes).toEqual([]);
	});

	it('keeps imported studios in the manual slot', () => {
		expect(buildImportedTitle({ title: 'A', manualStudio: ['X'] }, 'i', undefined).manualStudio).toEqual(['X']);
	});
});

describe('missingTypeNames', () => {
	it('collects unknown entry types case-insensitively', () => {
		const out = missingTypeNames([{ type: 'anime' }, { type: 'Doku' }, { type: ' ' }, {}], ['Anime'], {});
		expect([...out]).toEqual(['Doku']);
	});

	it('adds folder-safe names marked for creation', () => {
		const out = missingTypeNames([], ['Anime'], { 'a/b': '__create__', Anime: '__create__', x: 'Anime' });
		expect([...out]).toEqual(['a-b']);
	});
});

describe('mapImportRows', () => {
	const headers = ['Title', 'Rating'];
	const mapping = { title: 'Title', rating: 'Rating' };
	const build = (get: (k: string) => string): { title: string } | null => (get('title') ? { title: get('title') } : null);

	it('keeps each row\'s own raw rating cell when blank or skipped rows sit in between', () => {
		const csv = [headers, ['A', 'Great'], ['', ''], ['', 'orphan'], ['B', 'Meh'], ['C', 'Ok']];
		const rows = mapImportRows(csv, headers, mapping, build, () => false);
		expect(rows.map((r) => r.entry.title)).toEqual(['A', 'B', 'C']);
		expect(rows.map((r) => r.rawRating)).toEqual(['Great', 'Meh', 'Ok']);
	});

	it('yields an empty raw rating when no rating column is mapped', () => {
		const rows = mapImportRows([headers, ['A', 'Great']], headers, { title: 'Title' }, build, () => false);
		expect(rows[0]?.rawRating).toBe('');
	});
});

describe('buildImportedTitle complete entries', () => {
	const NOW = '2026-03-04T05:06:07.000Z';
	beforeEach(() => {
		// without fake timers this mocks Date only
		vi.setSystemTime(NOW);
	});
	afterEach(() => { vi.useRealTimers(); });

	it('builds the complete title for a bare entry', () => {
		expect(buildImportedTitle({ title: '  Foo ' }, 'id1', undefined)).toStrictEqual({
			id: 'id1', title: 'Foo', type: 'Anime', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0, notes: '',
			dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW, totalEpisodes: 0, episodeDuration: 0,
			releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [], favorite: false,
		});
	});

	it('builds the complete title for a fully mapped entry', () => {
		const built = buildImportedTitle({
			title: 'Dark', type: ' TV Show ', status: 'Completed', priority: 'High', rating: 4.5, notes: 'n', dateStarted: '2026-01-01',
			dateFinished: '2026-01-09', totalEpisodes: 2, episodeDuration: 50, releaseDate: '2017-12-01', externalLink: 'https://d.test',
			manualStudio: ['W&B'],
		}, 'TV Show/Dark', 'Movie');
		expect(built).toStrictEqual({
			id: 'TV Show/Dark', title: 'Dark', type: 'TV Show', status: 'Completed', priority: 'High', review: '', rating: 4.5, notes: 'n',
			dateStarted: '2026-01-01', dateFinished: '2026-01-09', dateAdded: NOW, dateModified: NOW, totalEpisodes: 2, episodeDuration: 50,
			releaseDate: '2017-12-01', externalLink: 'https://d.test', seasons: [], watchedEpisodes: [1, 2], favorite: false,
			manualStudio: ['W&B'],
		});
	});

	it('falls back for an empty type, status and priority and ignores an empty studio list', () => {
		const built = buildImportedTitle({ title: 'A', type: '  ', status: '', priority: '', manualStudio: [] }, 'i', 'Series');
		expect(built).toMatchObject({ type: 'Series', status: 'Plan to watch', priority: 'Medium' });
		expect(Object.keys(built)).not.toContain('manualStudio');
	});

	it('ignores fields of the entry that the import does not map', () => {
		const built = buildImportedTitle({ title: 'A', review: 'r', favorite: true, posterUrl: 'p', maybe: true }, 'i', undefined);
		expect(built).toMatchObject({ review: '', favorite: false });
		expect(Object.keys(built)).not.toContain('posterUrl');
		expect(Object.keys(built)).not.toContain('maybe');
	});
});
