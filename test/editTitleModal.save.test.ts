import { describe, expect, it } from 'vitest';
import { EditTitleModal } from '../src/EditTitleModal';
import type { HoardTitle } from '../src/types';

const ORIGINAL: HoardTitle = {
	id: 'TV Show/Dark', title: 'Dark', type: 'TV Show', status: 'Completed', priority: '', review: 'Good', rating: 4, notes: 'n',
	dateStarted: '2026-01-01', dateFinished: '2026-01-09', dateAdded: '2025-12-01T00:00:00.000Z', dateModified: '2026-01-09T00:00:00.000Z',
	totalEpisodes: 2, episodeDuration: 50, releaseDate: '2017-12-01', externalLink: 'https://example.test/dark',
	seasons: [{ name: 'Season 1', episodes: 2, offset: 0 }], watchedEpisodes: [1, 2], favorite: true, posterUrl: 'none',
};

type Form = { saveTitle: () => Promise<void>; fieldEpisodes: number; fieldTitle: string; fieldSeasonsText: string };

function setup(original: HoardTitle) {
	const updated: HoardTitle[] = [];
	const dataManager = {
		getGroups: () => [],
		getTitles: () => [original],
		updateTitle: (t: HoardTitle) => { updated.push(structuredClone(t)); return Promise.resolve(); },
	};
	const modal = new EditTitleModal({} as never, { settings: { types: [] } } as never, dataManager as never, original, () => {});
	return { form: modal as unknown as Form, updated };
}

describe('EditTitleModal save', () => {
	it('re-ticks every episode of a Completed title when the episode count changes', async () => {
		const { form, updated } = setup(ORIGINAL);
		form.fieldEpisodes = 4;
		form.fieldTitle = ' Dark (2017) ';
		form.fieldSeasonsText = 'Season 1: 4';
		await form.saveTitle();
		expect(updated).toStrictEqual([{
			...ORIGINAL, title: 'Dark (2017)', totalEpisodes: 4, watchedEpisodes: [1, 2, 3, 4],
			seasons: [{ name: 'Season 1', episodes: 4, offset: 0, skippedEpisodes: [] }], manualTrailerUrl: '',
		}]);
	});

	it('keeps the watched episodes of a title that is not Completed', async () => {
		const { form, updated } = setup({ ...ORIGINAL, status: 'Watching', watchedEpisodes: [1] });
		form.fieldEpisodes = 4;
		await form.saveTitle();
		expect(updated[0]).toMatchObject({ status: 'Watching', totalEpisodes: 4, watchedEpisodes: [1] });
	});

	it('keeps the watched episodes of a Completed title whose episode count is set to zero', async () => {
		const { form, updated } = setup(ORIGINAL);
		form.fieldEpisodes = 0;
		await form.saveTitle();
		expect(updated[0]).toMatchObject({ totalEpisodes: 0, watchedEpisodes: [1, 2] });
	});
});

describe('EditTitleModal seasons text', () => {
	const seasonsFor = async (text: string) => {
		const { form, updated } = setup(ORIGINAL);
		form.fieldSeasonsText = text;
		await form.saveTitle();
		return updated[0]!.seasons;
	};
	const skippedFor = async (line: string) => (await seasonsFor(line))[0]?.skippedEpisodes;

	it('reads names, counts and skip lists, with cumulative offsets', async () => {
		expect(await seasonsFor('S1: 12 (5,8,10-11)\nS2: 3')).toStrictEqual([
			{ name: 'S1', episodes: 12, offset: 0, skippedEpisodes: [5, 8, 10, 11] },
			{ name: 'S2', episodes: 3, offset: 12, skippedEpisodes: [] },
		]);
	});

	it('skips a line that is not "Name: N" and keeps a colon inside the name', async () => {
		expect(await seasonsFor('garbage\n\n  Re: Zero :  2  ( 2 , 1 )')).toStrictEqual([
			{ name: 'Re: Zero', episodes: 2, offset: 0, skippedEpisodes: [1, 2] },
		]);
		expect(await seasonsFor('garbage')).toEqual([]);
	});

	it('applies no bound to counts or skipped episodes', async () => {
		expect(await skippedFor('S1: 3 (9)')).toEqual([9]);
		expect(await skippedFor('S1: 3 (2-5)')).toEqual([2, 3, 4, 5]);
		expect((await seasonsFor('S1: 10001'))[0]).toMatchObject({ episodes: 10001 });
	});

	it('ignores a skip entry it cannot read', async () => {
		expect(await skippedFor('S1: 12 (x,7)')).toEqual([7]);
		expect(await skippedFor('S1: 12 (9-3)')).toEqual([]);
		expect(await skippedFor('S1: 12 (-5)')).toEqual([]);
		expect(await skippedFor('S1: 12 (3-x)')).toEqual([]);
	});

	it('ignores a skip entry with more than one dash, as the note codec does', async () => {
		expect(await skippedFor('S1: 12 (1-2-3)')).toEqual([]);
		expect(await skippedFor('S1: 12 (1-2-3,7)')).toEqual([7]);
	});

	it('shows the seasons of the title as text, runs of skipped episodes collapsed', () => {
		const { form } = setup({
			...ORIGINAL,
			seasons: [
				{ name: 'S1', episodes: 12, offset: 0, skippedEpisodes: [12, 5, 8, 10, 11, 5] },
				{ name: 'S2', episodes: 3, offset: 12, skippedEpisodes: [] },
				{ name: 'S3', episodes: 4, offset: 15 },
				{ name: 'S4', episodes: 9, offset: 19, skippedEpisodes: [1, 2, 4, 6, 7, 8] },
			],
		});
		expect(form.fieldSeasonsText).toBe('S1: 12 (5,8,10-12)\nS2: 3\nS3: 4\nS4: 9 (1-2,4,6-8)');
	});
});
