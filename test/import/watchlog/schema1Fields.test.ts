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
			`---\ntitle: "A"\ntype: "Movie"\nstatus: "Completed"\nrating: 2\ndirector: [${director}]\nposter: ${poster}\n---\n\n## Notes\n`;
		{
			const files: Record<string, string> = {
				'Hoard/Movie/A.md': original('Some Director', 'https://img.example/a.jpg'),
				'Hoard/Movie/Das doppelte Lottchen.md': '---\ntitle: "Das doppelte Lottchen"\ntype: "Movie"\ndirector: [Mine]\n---\n',
				'Hoard/Books/Dune.md': '---\ntitle: "Dune"\ntype: book\ncoverUrl: https://old-cover\n---\n',
			};
			const setup = await setupSchema1(withCovers(), files);
			const r = await setup.run();
			expect(r.errors).toEqual([]);
			const a = fmOf(setup.f.files.get('Hoard/Movie/A.md'));
			expect(a).not.toHaveProperty('director');
			expect(fmOf(setup.f.files.get('Hoard/Movie/Das doppelte Lottchen.md')).director).toEqual(['Mine']);
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
			'Hoard/Books/Dune.md': '---\ntitle: "Dune"\ntype: book\ncoverUrl: https://old-cover\n---\n',
			'Hoard/TV Show/Dark.md': '---\ntitle: "Dark"\ntype: "TV Show"\nposter: https://own\n---\n',
		};
		const setup = await setupSchema1(data, files);
		const r = await setup.run();
		expect(r.errors).toEqual([]);
		expect(fmOf(setup.f.files.get('Hoard/Movie/A.md')).poster).toBe('https://manual');
		expect(fmOf(setup.f.files.get('Hoard/TV Show/Dark.md')).poster).toBe('https://own');
		expect(fmOf(setup.f.files.get('Hoard/Books/Dune.md')).coverUrl).toBe('https://old-cover');
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
		expect(f.files.get('Hoard/TV Show/NoSeasons.md')).toContain('watched: S01E01-E05');
	});

	it.each([['https://youtu.be/api'], ['https://youtu.be/mine']])('rerun keeps a manual trailer (API: %s)', async (api) => {
		const stored = cloneData();
		const a = titleOf(stored, 'a');
		a.manualTrailerUrl = 'https://youtu.be/mine';
		a.trailerUrl = api;
		const { run, rerun, f } = await setupSchema1(stored, {});
		await run();
		expect(f.files.get('Hoard/Movie/A.md')).toContain('trailer: https://youtu.be/mine');
		await rerun();
		expect(f.files.get('Hoard/Movie/A.md')).toContain('trailer: https://youtu.be/mine');
	});

	it('rerun removes a trailer the API wrote', async () => {
		const stored = cloneData();
		const a = titleOf(stored, 'a');
		a.trailerUrl = 'https://youtu.be/api';
		const { run, f } = await setupSchema1(stored, {});
		const path = 'Hoard/Movie/A.md';
		await run();
		// the original plugin had written the fetched trailer into the note
		f.externalWrite(path, f.files.get(path)!.replace('---\n', '---\ntrailer: https://youtu.be/api\n'));
		await run();
		expect(f.files.get(path)).not.toContain('trailer:');
	});
});

/** The fixture with a cover on the book. */
function withCovers(): typeof watchLogData {
	const data = structuredClone(watchLogData);
	const dune = data.reading.books[0] as { coverUrl: string };
	dune.coverUrl = 'https://old-cover';
	return data;
}
