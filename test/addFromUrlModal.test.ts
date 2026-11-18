import { describe, expect, it, vi } from 'vitest';
import type { OpenAddTitle } from '../src/modules/watchlist/ui/AddTitleModal';
import { AddFromUrlModal } from '../src/modules/watchlist/ui/AddFromUrlModal';
import { t } from '../src/shared/i18n';
import { fakeSettings } from './helpers/fakeSettings';
import type { MediaSearchResult } from '../src/shared/domain/types';

const result = (over: Partial<MediaSearchResult> = {}): MediaSearchResult => ({
	imdbId: 'tt1', title: 'Inception', mediaType: 'movie', episodes: 1, episodeDuration: 148, releaseDate: '2010-07-16',
	url: 'https://imdb.test/tt1', seasons: [], ...over,
});

function setup(activeApi: 'TMDB' | 'OMDb' = 'TMDB', hasKey = true) {
	const api = {
		getTmdbByImdbId: vi.fn(() => Promise.resolve<MediaSearchResult | null>(result())),
		getOmdbByImdbId: vi.fn(() => Promise.resolve<MediaSearchResult | null>(result({ mediaType: 'tv' }))),
		hasTmdbKey: () => hasKey,
		hasOmdbKey: () => hasKey,
		getCinemetaDetails: vi.fn((_id: string, kind: string) => Promise.resolve<MediaSearchResult | null>(kind === 'tv' ? result({ mediaType: 'tv' }) : null)),
		getTmdbMovieDetails: vi.fn(() => Promise.resolve<MediaSearchResult | null>(result({ trailerUrl: 'yt' }))),
		getTmdbTvDetails: vi.fn(() => Promise.resolve<MediaSearchResult | null>(result({ mediaType: 'tv' }))),
	};
	const openAddTitle = vi.fn<OpenAddTitle>();
	const onAdded = vi.fn();
	const modal = new AddFromUrlModal({} as never, fakeSettings({ activeApi }) as never, api, openAddTitle, { onAdded });
	modal.open();
	const inputs = Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('input'));
	const buttons = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button'));
	const error = (): HTMLElement => modal.contentEl.querySelector<HTMLElement>('.hoard-modal__error')!;
	return { modal, api, openAddTitle, onAdded, imdb: inputs[0]!, tmdb: inputs[1]!, imdbBtn: buttons[0]!, tmdbBtn: buttons[1]!, error };
}

describe('AddFromUrlModal', () => {
	it('starts without an error and rejects a URL without an IMDb id', async () => {
		const { imdb, imdbBtn, error, api } = setup();
		expect(error().style.display).toBe('none');
		imdb.value = 'https://example.com';
		imdbBtn.click();
		expect(imdbBtn.disabled).toBe(true);
		expect(imdbBtn.textContent).toBe('Loading…');
		await vi.waitFor(() => expect(error().style.display).toBe(''));
		expect(error().textContent).toBe('Title not found. Please check the URL and try again.');
		expect(api.getTmdbByImdbId).not.toHaveBeenCalled();
		expect(imdbBtn.disabled).toBe(false);
		expect(imdbBtn.textContent).toBe('Add');
	});

	it('looks an IMDb link up on TMDB and opens the add form as a movie', async () => {
		const { imdb, imdbBtn, api, openAddTitle, onAdded } = setup('TMDB');
		imdb.value = 'https://www.imdb.com/title/tt1375666/';
		imdbBtn.click();
		await vi.waitFor(() => expect(openAddTitle).toHaveBeenCalledOnce());
		expect(openAddTitle.mock.calls[0]![0].onAdded).toBe(onAdded);
		expect(api.getTmdbByImdbId).toHaveBeenCalledWith('tt1375666');
		expect(openAddTitle.mock.calls[0]![0].prefill).toMatchObject({
			title: 'Inception', type: 'Movie', episodes: 1, duration: 148, releaseDate: '2010-07-16',
			link: 'https://imdb.test/tt1', trailerUrl: '',
		});
	});

	it('uses OMDb when it is the active API and maps series to TV Show', async () => {
		const { imdb, imdbBtn, api, openAddTitle } = setup('OMDb');
		imdb.value = 'tt0944947';
		imdbBtn.click();
		await vi.waitFor(() => expect(openAddTitle).toHaveBeenCalledOnce());
		expect(api.getOmdbByImdbId).toHaveBeenCalledWith('tt0944947');
		expect(openAddTitle.mock.calls[0]![0].prefill).toMatchObject({ type: 'TV Show' });
	});

	it('falls back to Cinemeta without a key, trying series then movie', async () => {
		const { imdb, imdbBtn, api, openAddTitle } = setup('OMDb', false);
		imdb.value = 'tt0944947';
		imdbBtn.click();
		await vi.waitFor(() => expect(openAddTitle).toHaveBeenCalledOnce());
		expect(api.getCinemetaDetails).toHaveBeenNthCalledWith(1, 'tt0944947', 'tv');
		expect(api.getOmdbByImdbId).not.toHaveBeenCalled();
		expect(openAddTitle.mock.calls[0]![0].prefill).toMatchObject({ type: 'TV Show' });
	});

	it('prefers the series record over a foreign movie record for the same id', async () => {
		const { imdb, imdbBtn, api, openAddTitle } = setup('OMDb', false);
		api.getCinemetaDetails.mockImplementation((_id: string, kind: string) =>
			Promise.resolve(kind === 'movie' ? result({ title: 'Foreign Film', mediaType: 'movie' }) : result({ title: 'Real Series', mediaType: 'tv' })));
		imdb.value = 'tt0903747';
		imdbBtn.click();
		await vi.waitFor(() => expect(openAddTitle).toHaveBeenCalledOnce());
		expect(openAddTitle.mock.calls[0]![0].prefill).toMatchObject({ title: 'Real Series' });
	});

	it('reports not found when the lookup resolves empty', async () => {
		const { imdb, imdbBtn, api, error, openAddTitle } = setup();
		api.getTmdbByImdbId.mockResolvedValueOnce(null);
		imdb.value = 'tt1';
		imdbBtn.click();
		await vi.waitFor(() => expect(error().textContent).toBe('Title not found. Please check the URL and try again.'));
		expect(openAddTitle).not.toHaveBeenCalled();
	});

	it('shows the API error message when the lookup rejects, not "not found"', async () => {
		const { imdb, imdbBtn, api, error } = setup();
		api.getTmdbByImdbId.mockRejectedValueOnce(new Error('boom'));
		imdb.value = 'tt1';
		imdbBtn.click();
		await vi.waitFor(() => expect(error().style.display).toBe(''));
		expect(error().textContent).toBe(t('notices.api.requestFailed'));
		expect(imdbBtn.disabled).toBe(false);
	});

	it('triggers the lookup with Enter in the input', async () => {
		const { imdb, api } = setup();
		imdb.value = 'tt7';
		imdb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await vi.waitFor(() => expect(api.getTmdbByImdbId).toHaveBeenCalledWith('tt7'));
		imdb.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		expect(api.getTmdbByImdbId).toHaveBeenCalledTimes(1);
	});

	it('rejects a TMDB link of the wrong shape', async () => {
		const { tmdb, tmdbBtn, error, api } = setup();
		tmdb.value = 'https://www.themoviedb.org/person/1';
		tmdbBtn.click();
		await vi.waitFor(() => expect(error().textContent).toBe('Title not found. Please check the URL and try again.'));
		expect(api.getTmdbMovieDetails).not.toHaveBeenCalled();
	});

	it('asks for a TMDB key before looking a TMDB link up', async () => {
		const { tmdb, tmdbBtn, error, api } = setup('TMDB', false);
		tmdb.value = 'https://www.themoviedb.org/movie/27205-inception';
		tmdbBtn.click();
		await vi.waitFor(() => expect(error().textContent).toBe('Add a TMDB API key in Settings → API to use TMDB links.'));
		expect(api.getTmdbMovieDetails).not.toHaveBeenCalled();
	});

	it('fetches movie and tv links by id and media type', async () => {
		const { tmdb, tmdbBtn, api, openAddTitle } = setup();
		tmdb.value = 'https://www.themoviedb.org/movie/27205-inception?language=en';
		tmdbBtn.click();
		await vi.waitFor(() => expect(openAddTitle).toHaveBeenCalledOnce());
		expect(api.getTmdbMovieDetails).toHaveBeenCalledWith('27205');
		expect(openAddTitle.mock.calls[0]![0].prefill).toMatchObject({ type: 'Movie', trailerUrl: 'yt' });

		const second = setup();
		second.tmdb.value = 'https://www.themoviedb.org/TV/1396';
		second.tmdbBtn.click();
		await vi.waitFor(() => expect(second.openAddTitle).toHaveBeenCalledOnce());
		expect(second.api.getTmdbTvDetails).toHaveBeenCalledWith('1396');
		expect(second.openAddTitle.mock.calls[0]![0].prefill).toMatchObject({ type: 'TV Show' });
	});
});
