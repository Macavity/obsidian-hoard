import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddTitleModal } from '../src/modules/watchlist/ui/AddTitleModal';
import { fakeSettings } from './helpers/fakeSettings';
import type { HoardTitle, Season } from '../src/shared/domain/types';
import type { LookupResult } from '../src/shared/api/lookup';

// noon UTC: the local calendar day is 2026-03-04 in every timezone the suite runs in
const NOW = '2026-03-04T12:00:00.000Z';
const SEASONS: Season[] = [{ name: 'Season 1', episodes: 3, offset: 0 }];

type Form = {
	addTitle: () => Promise<void>;
	fieldStatus: string; fieldPriority: string; fieldRating: number; fieldDateStarted: string;
	fieldTrailer: LookupResult<string> | undefined;
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
		recordLookup: vi.fn(),
	};
	const settings = fakeSettings({ setFinishDateAutomatically: autoFinish, lastAddedType: '', typeApiMapping: {}, types: [] });
	const modal = new AddTitleModal(
		{} as never,
		settings as never,
		dataManager as never,
		{ fetchCommunityRating: () => Promise.resolve(null) } as never,
		() => 'Movie',
		{
			onAdded: () => {},
			prefill: {
				title: ' Dark ', type: 'TV Show', episodes: prefill.episodes ?? 3, duration: 50, releaseDate: '2017-12-01',
				link: 'https://example.test/dark', seasons: SEASONS,
				trailerUrl: prefill.trailerUrl, director: prefill.director, cast: prefill.cast,
			},
		},
	);
	return { form: modal as unknown as Form, added, dataManager, settings };
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

	it('remembers the added type through the settings service', async () => {
		const { form, settings } = setup();
		await form.addTitle();
		expect(settings.update).toHaveBeenCalledOnce();
		expect(settings.get().lastAddedType).toBe('TV Show');
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

	it('records a trailer the source did not have, once the note exists', async () => {
		const { form, added, dataManager } = setup();
		form.fieldTrailer = { status: 'notfound' };
		await form.addTitle();
		expect(added[0]!.trailerUrl).toBe('');
		expect(dataManager.recordLookup).toHaveBeenCalledWith('t-Dark', 'trailer', { status: 'notfound' });
	});

	it('records a failed trailer lookup as failed, not as missing', async () => {
		const { form, dataManager } = setup();
		form.fieldTrailer = { status: 'failed' };
		await form.addTitle();
		expect(dataManager.recordLookup).toHaveBeenCalledWith('t-Dark', 'trailer', { status: 'failed' });
	});

	it('records nothing for a trailer that was never fetched', async () => {
		const { form, dataManager } = setup();
		await form.addTitle();
		expect(dataManager.recordLookup).not.toHaveBeenCalled();
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
