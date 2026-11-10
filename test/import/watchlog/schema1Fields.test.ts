import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import watchLogData from '../../fixtures/data-v1.json';
import { setupSchema1 } from './setupSchema1';
import type { HoardTitle } from '../../../src/types';
import type { WatchLogData } from '../../../src/import/watchlog/schema1Types';

const fmOf = (src: string | undefined): Record<string, unknown> =>
	parse(/^---\n([\s\S]*?)\n?---/.exec(src ?? '')?.[1] ?? '') as Record<string, unknown>;
const cloneData = (): WatchLogData => structuredClone(watchLogData) as unknown as WatchLogData;
const titleOf = (data: WatchLogData, id: string): HoardTitle => data.titles.find((t) => t.id === id)!;

describe('WatchLog import: API values, images', () => {
	it('import strips credits equal to the WatchLog API value and keeps differing ones', async () => {
		const original = (director: string, poster: string): string =>
			`---\nName: "A"\nType: "Movie"\nStatus: "Completed"\nRating: 2\nDirector: [${director}]\nCover: ${poster}\n---\n\n## Notes\n`;
		{
			const files: Record<string, string> = {
				'Hoard/Movie/A.md': original('Some Director', 'https://img.example/a.jpg'),
				'Hoard/Movie/Das doppelte Lottchen.md': '---\nName: "Das doppelte Lottchen"\nType: "Movie"\nDirector: [Mine]\n---\n',
				'Hoard/Books/Dune.md': '---\nName: "Dune"\nType: book\nCover: https://old-cover\n---\n',
			};
			const setup = await setupSchema1(withCovers(), files);
			const r = await setup.run();
			expect(r.errors).toEqual([]);
			const a = fmOf(setup.f.files.get('Hoard/Movie/A.md'));
			expect(a).not.toHaveProperty('Director');
			expect(fmOf(setup.f.files.get('Hoard/Movie/Das doppelte Lottchen.md')).Director).toEqual(['Mine']);
			const data = setup.local.data;
			expect(data.cache['Movie/A']).toMatchObject({ director: ['Some Director'] });
		}
	});

	it('import keeps poster and coverUrl; a WatchLog poster fills a note without one, manual wins', async () => {
		const data = structuredClone(watchLogData);
		const dune = data.reading.books[0] as { coverUrl: string };
		dune.coverUrl = 'https://old-cover';
		(data.titles[0] as Record<string, unknown>).manualPosterUrl = 'https://manual';
		const files = {
			'Hoard/Books/Dune.md': '---\nName: "Dune"\nType: book\nCover: https://old-cover\n---\n',
			'Hoard/TV Show/Dark.md': '---\nName: "Dark"\nType: "TV Show"\nCover: https://own\n---\n',
		};
		const setup = await setupSchema1(data, files);
		const r = await setup.run();
		expect(r.errors).toEqual([]);
		expect(fmOf(setup.f.files.get('Hoard/Movie/A.md')).Cover).toBe('https://manual');
		expect(fmOf(setup.f.files.get('Hoard/TV Show/Dark.md')).Cover).toBe('https://own');
		expect(fmOf(setup.f.files.get('Hoard/Books/Dune.md')).Cover).toBe('https://old-cover');
		const cache = setup.local.data.cache;
		expect(cache['Movie/A']).not.toHaveProperty('posterUrl');
		expect((cache['Books/Dune'] as Record<string, unknown> | undefined)?.['coverUrl']).toBeUndefined();
	});
});

describe('import of series without a season list', () => {
	it('keeps watched episodes of a title without seasons', async () => {
		const stored = cloneData();
		stored.titles.push({ ...titleOf(stored, 'dark'), id: 'x', title: 'NoSeasons', externalLink: '', seasons: [],
			totalEpisodes: 10, watchedEpisodes: [1, 2, 3, 4, 5], tmdbId: undefined, malId: undefined, anilistId: undefined });
		const { run, f } = await setupSchema1(stored, {});
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.get('Hoard/TV Show/NoSeasons.md')).toContain('Watched Episodes: S01E01-E05');
	});

	it.each([['https://youtu.be/api'], ['https://youtu.be/mine']])('rerun keeps a manual trailer (API: %s)', async (api) => {
		const stored = cloneData();
		const a = titleOf(stored, 'a');
		a.manualTrailerUrl = 'https://youtu.be/mine';
		a.trailerUrl = api;
		const { run, rerun, f } = await setupSchema1(stored, {});
		await run();
		expect(f.files.get('Hoard/Movie/A.md')).toContain('Trailer: https://youtu.be/mine');
		await rerun();
		expect(f.files.get('Hoard/Movie/A.md')).toContain('Trailer: https://youtu.be/mine');
	});

	it('rerun removes a trailer the API wrote', async () => {
		const stored = cloneData();
		const a = titleOf(stored, 'a');
		a.trailerUrl = 'https://youtu.be/api';
		const { run, f } = await setupSchema1(stored, {});
		const path = 'Hoard/Movie/A.md';
		await run();
		// the original plugin had written the fetched trailer into the note
		f.externalWrite(path, f.files.get(path)!.replace('---\n', '---\nTrailer: https://youtu.be/api\n'));
		await run();
		expect(f.files.get(path)).not.toContain('Trailer:');
	});
});

/** The fixture with a cover on the book. */
function withCovers(): typeof watchLogData {
	const data = structuredClone(watchLogData);
	const dune = data.reading.books[0] as { coverUrl: string };
	dune.coverUrl = 'https://old-cover';
	return data;
}

describe('import of custom columns', () => {
	const withColumns = (columns: unknown[], values: Record<string, unknown>): WatchLogData => {
		const data = cloneData();
		(data.reading as unknown as { bookColumns: unknown[] }).bookColumns = columns;
		(data.reading!.books[0] as { customFields: unknown }).customFields = values;
		return data;
	};
	const col = (id: string, name: unknown) => ({ id, name, type: 'text', options: [] });

	it('keeps the values of columns that differ only by case', async () => {
		const setup = await setupSchema1(withColumns([col('a', 'Foo'), col('b', 'foo')], { a: 'one', b: 'two' }), {});
		const r = await setup.run();
		expect(r.errors).toEqual([]);
		const fm = fmOf(setup.f.files.get('Hoard/Books/Dune.md'));
		expect(fm['Custom Foo']).toBe('one');
		expect(fm['Custom foo 2']).toBe('two');
		expect(setup.f.files.get('Hoard/Hoard.base')).toContain('foo 2');
	});

	it('gives blank and non-string names a generated name and keeps their values', async () => {
		const setup = await setupSchema1(withColumns([col('a', '  '), col('b', 42), col('c', null)], { a: 'x', b: 'y', c: 'z' }), {});
		const r = await setup.run();
		expect(r.errors).toEqual([]);
		const fm = fmOf(setup.f.files.get('Hoard/Books/Dune.md'));
		expect(fm['Custom Field 1']).toBe('x');
		expect(fm['Custom Field 2']).toBe('y');
		expect(fm['Custom Field 3']).toBe('z');
	});

	it('reports a value whose column does not exist', async () => {
		const setup = await setupSchema1(withColumns([col('a', 'Foo')], { a: 'one', gone: 'lost' }), {});
		const r = await setup.run();
		expect(r.errors).toEqual([]);
		expect(r.review).toContainEqual({
			path: 'Hoard/Books/Dune.md', reason: 'error', code: 'orphanValue', params: { column: 'gone', value: 'lost' },
		});
	});
});
