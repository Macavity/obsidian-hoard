import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';
import { PosterService } from '../src/shared/api/PosterService';
import type { HoardTitle } from '../src/modules/watchlist/domain/model';
import { DEFAULT_SETTINGS } from '../src/modules/settings/domain/settingsDefaults';
import type { ApiService } from '../src/shared/api/ApiService';
import { FAILED, NOT_FOUND } from '../src/shared/api/lookup';
import { setupDataManager } from './helpers/setupDataManager';
import { buildPosterCard } from '../src/design-system/PosterCard';
import { movieNote, setupListTab } from './helpers/setupListTab';
import type { DataManager } from '../src/modules/watchlist/services/DataManager';

const sent = vi.mocked(requestUrl);
interface Reply { status: number; json?: unknown }
const reply = (r: Reply) => ({ status: r.status, text: JSON.stringify(r.json ?? {}), json: r.json ?? {} }) as never;
let routes: Record<string, Reply> = {};
/** Answers each request with the first route whose key the URL contains; unknown URLs get an empty 200. */
function route(next: Record<string, Reply>) { routes = next; }
const answer = (params: unknown) => {
	const url = (params as { url?: string } | undefined)?.url ?? '';
	const key = Object.keys(routes).find((k) => url.includes(k));
	return Promise.resolve(reply(key === undefined ? { status: 200 } : routes[key]!));
};
const urls = () => sent.mock.calls.map((c) => (c[0] as { url: string }).url);

const ID = 'TV Show/Breaking Bad';
const NOTE = '---\nName: Breaking Bad\nType: TV Show\nSource Type: Series\n---\n';
const none = { searchCinemeta: vi.fn().mockResolvedValue([]) } as unknown as ApiService;

async function setup(keys: { tmdbApiKey?: string; omdbApiKey?: string } = {}, api: ApiService | null = none) {
	const env = await setupDataManager({ 'W/TV Show/Breaking Bad.md': NOTE });
	const svc = new PosterService(
		env.dm,
		() => ({ ...DEFAULT_SETTINGS, tmdbApiKey: '', omdbApiKey: '', ...keys, typeApiMapping: { Doc: 'movie' } }),
		api ? () => api : undefined,
	);
	const title = (extra: Partial<HoardTitle> = {}): HoardTitle => ({ ...env.dm.getTitle(ID)!, ...extra });
	const check = () => env.local.getCache(ID)?.apiCheck?.poster?.result;
	return { ...env, svc, title, check, poster: () => env.dm.getTitle(ID)?.posterUrl };
}

beforeEach(() => {
	routes = {};
	sent.mockReset();
	sent.mockImplementation(answer as never);
});

describe('PosterService outcomes', () => {
	it('TMDB 500 then OMDb 404 is transient and writes no Cover', async () => {
		route({ 'themoviedb.org': { status: 500 }, 'omdbapi.com': { status: 404 } });
		const { svc, title, check, poster } = await setup({ tmdbApiKey: 't', omdbApiKey: 'o' });
		expect(await svc.enqueue(title())).toBeNull();
		expect(check()).toBe('transient');
		expect(poster()).toBeFalsy();
	});

	it('a TMDB 404 (a stale id) is notfound, not transient', async () => {
		route({ 'themoviedb.org': { status: 404 } });
		const { svc, title, check } = await setup({ tmdbApiKey: 't' }, null);
		expect(await svc.enqueue(title())).toBeNull();
		expect(check()).toBe('notfound');
	});

	it('a rejected TMDB key (401) is nokey, not transient', async () => {
		route({ 'themoviedb.org': { status: 401 } });
		const { svc, title, check } = await setup({ tmdbApiKey: 't' }, null);
		expect(await svc.enqueue(title())).toBeNull();
		expect(check()).toBe('nokey');
	});

	it('every provider answering with a clean miss is notfound', async () => {
		route({ 'themoviedb.org': { status: 200, json: { results: [] } }, 'omdbapi.com': { status: 200, json: { Response: 'False' } } });
		const { svc, title, check } = await setup({ tmdbApiKey: 't', omdbApiKey: 'o' });
		expect(await svc.enqueue(title())).toBeNull();
		expect(check()).toBe('notfound');
	});

	it('a TMDB hit writes Cover and records nothing', async () => {
		route({ 'search/tv': { status: 200, json: { results: [{ poster_path: '/bb.jpg' }] } } });
		const { svc, title, check, poster, f } = await setup({ tmdbApiKey: 't' });
		expect(await svc.enqueue(title())).toBe('https://image.tmdb.org/t/p/w300/bb.jpg');
		expect(poster()).toBe('https://image.tmdb.org/t/p/w300/bb.jpg');
		expect(f.files.get('W/TV Show/Breaking Bad.md')).toContain('Cover: https://image.tmdb.org/t/p/w300/bb.jpg');
		expect(check()).toBeUndefined();
	});

	it('no key and no api is nokey', async () => {
		const { svc, title, check } = await setup({}, null);
		expect(await svc.enqueue(title())).toBeNull();
		expect(check()).toBe('nokey');
	});

	it('routes by Source Type: Anime sourceType searches the anime source, Type alone does not', async () => {
		route({ jikan: { status: 500 }, tenrai: { status: 500 } });
		const { svc, title } = await setup();
		expect(await svc.enqueue(title({ type: 'Movie', sourceType: 'Anime' }))).toBeNull();
		expect(urls().length).toBeGreaterThan(0);
		sent.mockClear();
		expect(await svc.enqueue(title({ type: 'Anime', sourceType: undefined }), true)).toBeNull();
		expect(sent).not.toHaveBeenCalled();
	});

	it('records a failed anime lookup as transient', async () => {
		route({ jikan: { status: 500 }, tenrai: { status: 500 } });
		const { svc, title, check } = await setup();
		expect(await svc.enqueue(title({ sourceType: 'Anime', malId: 5 }))).toBeNull();
		expect(urls().length).toBeGreaterThan(0);
		expect(check()).toBe('transient');
	});

	it('an explicit refresh searches although notfound is fresh', async () => {
		route({ 'search/tv': { status: 200, json: { results: [{ poster_path: '/new.jpg' }] } } });
		const { svc, title, dm, poster } = await setup({ tmdbApiKey: 't' });
		dm.recordLookup(ID, 'poster', NOT_FOUND);
		expect(await svc.enqueue(title())).toBeNull();
		expect(sent).not.toHaveBeenCalled();
		expect(await svc.enqueue(title(), true)).toBe('https://image.tmdb.org/t/p/w300/new.jpg');
		expect(poster()).toBe('https://image.tmdb.org/t/p/w300/new.jpg');
	});

	it('a title that sent no request does not hold up the queue', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		try {
			route({ 'search/tv': { status: 200, json: { results: [{ poster_path: '/bb.jpg' }] } } });
			const { svc, title, dm } = await setup({ tmdbApiKey: 't' });
			dm.recordLookup(ID, 'poster', NOT_FOUND);
			const skipped = svc.enqueue(title());
			const next = svc.enqueue(title(), true);
			// no timer is advanced: the skipped title must not have slept its delay
			await expect(next).resolves.toBe('https://image.tmdb.org/t/p/w300/bb.jpg');
			await expect(skipped).resolves.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not search again while a failure is fresh', async () => {
		const { dm, title, svc } = await setup({ tmdbApiKey: 't' });
		dm.recordLookup(ID, 'poster', FAILED);
		expect(await svc.enqueue(title())).toBeNull();
		expect(sent).not.toHaveBeenCalled();
	});
});

describe('PosterService TMDB parsing', () => {
	const img = (p: string) => `https://image.tmdb.org/t/p/w300${p}`;
	const run = async (items: unknown, extra: Partial<HoardTitle> = {}) => {
		route({ 'search/': { status: 200, json: { results: items } } });
		const { svc, title } = await setup({ tmdbApiKey: 't' });
		return svc.enqueue(title(extra));
	};

	it('prefers the result whose year matches', async () => {
		const items = [{ poster_path: '/a.jpg', first_air_date: '2001-01-01' }, { poster_path: '/b.jpg', first_air_date: '2008-01-20' }];
		expect(await run(items, { releaseDate: '2008-01-20' })).toBe(img('/b.jpg'));
	});

	it('uses release_date for movies', async () => {
		const items = [{ poster_path: '/a.jpg', release_date: '2001-01-01' }, { poster_path: '/b.jpg', release_date: '2008-01-20' }];
		expect(await run(items, { type: 'Movie', sourceType: 'Movie', releaseDate: '2008' })).toBe(img('/b.jpg'));
	});

	it('falls back to the first result with a poster when the year matches none', async () => {
		const items = [{ poster_path: null }, { poster_path: '/a.jpg', first_air_date: '2001' }];
		expect(await run(items, { releaseDate: '2008' })).toBe(img('/a.jpg'));
	});

	it('skips a year match without a poster', async () => {
		const items = [{ first_air_date: '2008-01-01' }, { poster_path: '/a.jpg' }];
		expect(await run(items, { releaseDate: '2008' })).toBe(img('/a.jpg'));
	});

	it('treats wrong-typed fields as missing', async () => {
		const items = [null, 'x', { poster_path: 5 }, { poster_path: '' }, { poster_path: '/ok.jpg', release_date: 7 }];
		expect(await run(items)).toBe(img('/ok.jpg'));
	});

	it.each([[undefined], [null], ['x'], [[]], [[{ poster_path: null }]]])('is a miss for results %j', async (items) => {
		expect(await run(items)).toBeNull();
	});

	it('resolves by IMDb id first', async () => {
		route({ 'find/tt0903747': { status: 200, json: { tv_results: [{ poster_path: '/id.jpg' }] } } });
		const { svc, title } = await setup({ tmdbApiKey: 't' });
		expect(await svc.enqueue(title({ externalLink: 'https://www.imdb.com/title/tt0903747/' }))).toBe(img('/id.jpg'));
		expect(urls()).toHaveLength(1);
	});

	it('searches on when the IMDb match has no poster_path', async () => {
		route({
			'find/tt0903747': { status: 200, json: { movie_results: [{ poster_path: null }] } },
			'search/tv': { status: 200, json: { results: [{ poster_path: '/s.jpg' }] } },
		});
		const { svc, title } = await setup({ tmdbApiKey: 't' });
		expect(await svc.enqueue(title({ externalLink: 'tt0903747' }))).toBe(img('/s.jpg'));
	});

});

describe('PosterService OMDb parsing', () => {
	const run = async (routes: Record<string, Reply>, extra: Partial<HoardTitle> = {}) => {
		route(routes);
		const { svc, title } = await setup({ omdbApiKey: 'o' });
		return svc.enqueue(title(extra));
	};

	it('takes an https poster', async () => {
		expect(await run({ omdbapi: { status: 200, json: { Poster: 'https://img/p.jpg' } } })).toBe('https://img/p.jpg');
	});

	it.each([['N/A'], [7], [null], ['http://img/p.jpg']])('is a miss for Poster %j', async (poster) => {
		expect(await run({ omdbapi: { status: 200, json: { Poster: poster } } })).toBeNull();
	});

	it('retries without the year when the year search has no poster', async () => {
		route({ '&y=2008': { status: 200, json: { Poster: 'N/A' } }, omdbapi: { status: 200, json: { Poster: 'https://img/p.jpg' } } });
		const { svc, title } = await setup({ omdbApiKey: 'o' });
		expect(await svc.enqueue(title({ releaseDate: '2008-01-20' }))).toBe('https://img/p.jpg');
		expect(urls()).toHaveLength(2);
	});

	it('resolves by IMDb id first and searches on without a poster', async () => {
		route({ 'i=tt0903747': { status: 200, json: { Poster: 'N/A' } }, 't=': { status: 200, json: { Poster: 'https://img/t.jpg' } } });
		const { svc, title } = await setup({ omdbApiKey: 'o' });
		expect(await svc.enqueue(title({ externalLink: 'https://www.imdb.com/title/tt0903747/' }))).toBe('https://img/t.jpg');
	});

});

describe('PosterService anime parsing', () => {
	const anime = async (json: unknown, extra: Partial<HoardTitle>) => {
		route({ '': { status: 200, json } });
		const { svc, title } = await setup();
		return svc.enqueue(title({ sourceType: 'Anime', ...extra }));
	};
	const media = (coverImage: unknown) => ({ data: { Media: { coverImage } } });

	it('reads the AniList cover, large before medium', async () => {
		expect(await anime(media({ large: 'https://a/l.jpg', medium: 'https://a/m.jpg' }), { anilistId: 1 })).toBe('https://a/l.jpg');
		expect(await anime(media({ large: '', medium: 'https://a/m.jpg' }), { anilistId: 1 })).toBe('https://a/m.jpg');
		expect(await anime(media('x'), { anilistId: 1 })).toBeNull();
	});

	it('reads the Jikan cover by MAL id and by search', async () => {
		const jpg = { large_image_url: 'https://j/l.jpg', image_url: 'https://j/s.jpg' };
		expect(await anime({ data: { images: { jpg } } }, { malId: 3 })).toBe('https://j/l.jpg');
		expect(await anime({ data: [{ images: { jpg: { image_url: 'https://j/s.jpg' } } }] }, {})).toBe('https://j/s.jpg');
		expect(await anime({ data: null }, {})).toBeNull();
	});
});

describe('a poster that fails to load', () => {
	it('stores nothing', async () => {
		const { plugin, local } = await setupDataManager({ 'W/TV Show/Breaking Bad.md': NOTE });
		const write = vi.spyOn(plugin.app.fileManager, 'processFrontMatter');
		const setCache = vi.spyOn(local, 'setCache');
		const card = buildPosterCard(document.createElement('div'), {
			title: 'Breaking Bad', posterUrl: 'https://img/p.jpg', placeholderColor: '#888', onClick: () => undefined,
		}, { container: document.createElement('div'), cleanups: [] });
		expect(card.classList.contains('has-poster')).toBe(true);
		card.querySelector('img')!.dispatchEvent(new Event('error'));
		expect(card.classList.contains('has-poster')).toBe(false);
		expect(write).not.toHaveBeenCalled();
		expect(setCache).not.toHaveBeenCalled();
	});
});

describe('the card gate', () => {
	const visible = async (setupEach: (dm: DataManager) => void) => {
		const { tab, dm, posters } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		setupEach(dm);
		const card = document.createElement('div');
		card.dataset.titleId = 'Movie/A';
		(tab as unknown as { handleCardsVisible(c: HTMLElement[]): void }).handleCardsVisible([card]);
		return posters.enqueue;
	};

	it('enqueues a title that was never looked up', async () => {
		expect(await visible(() => undefined)).toHaveBeenCalledTimes(1);
	});

	it('does not enqueue a title whose lookup failed ten minutes ago', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			const enqueue = await visible((dm) => {
				vi.setSystemTime(Date.now() - 10 * 60_000);
				dm.recordLookup('Movie/A', 'poster', FAILED);
				vi.setSystemTime(Date.now() + 10 * 60_000);
			});
			expect(enqueue).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
