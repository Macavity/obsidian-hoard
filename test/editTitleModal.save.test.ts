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
