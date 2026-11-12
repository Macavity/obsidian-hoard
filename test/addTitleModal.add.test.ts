import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddTitleModal } from '../src/AddTitleModal';
import type { HoardTitle, Season } from '../src/types';

// noon UTC: the local calendar day is 2026-03-04 in every timezone the suite runs in
const NOW = '2026-03-04T12:00:00.000Z';
const SEASONS: Season[] = [{ name: 'Season 1', episodes: 3, offset: 0 }];

type Form = {
	addTitle: () => Promise<void>;
	fieldStatus: string; fieldPriority: string; fieldRating: number; fieldDateStarted: string;
	fieldMalId: number | null; fieldAnilistId: number | null; fieldStudio: string[]; fieldPosterUrl: string;
};

interface Prefill { director?: string[]; cast?: string[]; trailerUrl?: string; episodes?: number }

function setup(prefill: Prefill = {}, autoFinish = true) {
	const added: HoardTitle[] = [];
	const dataManager = {
		getTitles: () => [],
		getGroups: () => [],
		generateId: (title: string) => `t-${title}`,
		// a copy: the pin is what was handed over, whatever happens to the object afterwards
		addTitle: (entry: HoardTitle) => { added.push(structuredClone(entry)); return Promise.resolve(); },
	};
	const plugin = {
		settings: { setFinishDateAutomatically: autoFinish, lastAddedType: '', typeApiMapping: {}, types: [] },
		resolveDefaultAddType: () => 'Movie',
		saveSettings: () => Promise.resolve(),
		apiService: { fetchCommunityRating: () => Promise.resolve(null) },
	};
	const modal = new AddTitleModal({} as never, plugin as never, dataManager as never, () => {}, {
		title: ' Dark ', type: 'TV Show', episodes: prefill.episodes ?? 3, duration: 50, releaseDate: '2017-12-01',
		link: 'https://example.test/dark', seasons: SEASONS,
		trailerUrl: prefill.trailerUrl, director: prefill.director, cast: prefill.cast,
	});
	return { form: modal as unknown as Form, added };
}

const BASE = {
	id: 't-Dark', title: 'Dark', type: 'TV Show', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW, totalEpisodes: 3, episodeDuration: 50,
	releaseDate: '2017-12-01', externalLink: 'https://example.test/dark', seasons: SEASONS, watchedEpisodes: [],
	favorite: false, posterUrl: '', trailerUrl: '', manualTrailerUrl: '',
};

beforeEach(() => {
	// without fake timers this mocks Date only
	vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

describe('AddTitleModal add', () => {
	it('builds the complete title without credits or anime ids', async () => {
		const { form, added } = setup();
		await form.addTitle();
		expect(added).toStrictEqual([BASE]);
	});

	it('carries credits, anime ids and the form fields when set', async () => {
		const { form, added } = setup({ director: ['D'], cast: ['C1', 'C2'], trailerUrl: 'https://yt.test/t' });
		Object.assign(form, {
			fieldStatus: 'Watching', fieldPriority: 'High', fieldRating: 4, fieldDateStarted: '2026-02-01',
			fieldMalId: 0, fieldAnilistId: 7, fieldStudio: ['S'], fieldPosterUrl: 'https://img.test/dark.jpg',
		});
		await form.addTitle();
		expect(added).toStrictEqual([{
			...BASE, status: 'Watching', priority: 'High', rating: 4, dateStarted: '2026-02-01',
			posterUrl: 'https://img.test/dark.jpg', trailerUrl: 'https://yt.test/t',
			director: ['D'], cast: ['C1', 'C2'], studio: ['S'], malId: 0, anilistId: 7,
		}]);
	});

	it('ticks every episode and sets the finish date when added as Completed', async () => {
		const { form, added } = setup();
		form.fieldStatus = 'Completed';
		await form.addTitle();
		expect(added).toStrictEqual([{ ...BASE, status: 'Completed', watchedEpisodes: [1, 2, 3], dateFinished: '2026-03-04' }]);
	});

	it('ticks every episode without a finish date when the setting is off', async () => {
		const { form, added } = setup({}, false);
		form.fieldStatus = 'Completed';
		await form.addTitle();
		expect(added).toStrictEqual([{ ...BASE, status: 'Completed', watchedEpisodes: [1, 2, 3] }]);
	});

	it('leaves a Completed title with no episodes unticked and without a finish date', async () => {
		const { form, added } = setup({ episodes: 0 });
		form.fieldStatus = 'Completed';
		await form.addTitle();
		expect(added).toStrictEqual([{ ...BASE, status: 'Completed', totalEpisodes: 0 }]);
	});
});
