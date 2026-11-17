import { requestUrl } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../src/ApiService';
import googleVolumes from './fixtures/google-books-volumes.json';
import igdbGames from './fixtures/igdb-games.json';
import jikanManga from './fixtures/jikan-manga.json';
import rawgGame from './fixtures/rawg-game.json';
import rawgStores from './fixtures/rawg-stores.json';
import steamAchievements from './fixtures/steam-achievements.json';
import steamAppDetails from './fixtures/steam-appdetails.json';
import steamOwned from './fixtures/steam-owned-games.json';

const sent = vi.mocked(requestUrl);
const ok = (json: unknown) => ({ status: 200, text: JSON.stringify(json), json }) as never;
const reply = (code: number) => ({ status: code, text: '', json: null }) as never;

/** Answers by URL part: the first matching route wins; an Error rejects, a number is an HTTP status, anything unmatched is offline. */
function route(routes: Array<[string, unknown]>) {
	sent.mockImplementation(((p: { url: string }) => {
		const hit = routes.find(([part]) => p.url.includes(part));
		if (!hit) return Promise.reject(new Error('offline'));
		if (hit[1] instanceof Error) return Promise.reject(hit[1]);
		if (typeof hit[1] === 'number') return Promise.resolve(reply(hit[1]));
		return Promise.resolve(ok(hit[1]));
	}) as never);
}
const respond = (json: unknown) => route([['', json]]);
const calls = (part: string) => sent.mock.calls.filter(([p]) => (p as { url: string }).url.includes(part)).length;

const books = () => new ApiService('', '', 'gkey');
const manga = () => new ApiService('');
const rawg = () => new ApiService('', '', '', 'rkey');
const igdb = () => new ApiService('', '', '', '', 'cid', 'secret');
const steam = () => new ApiService('', '', '', '', '', '', 'skey', '76561198000000000');
const caught = async (p: Promise<unknown>): Promise<unknown> => {
	try { await p; } catch (e) { return e; }
	return null;
};

beforeEach(() => { sent.mockReset(); });

describe('Google Books', () => {
	it('maps a real volume list', async () => {
		respond(googleVolumes);
		const [hobbit, silmarillion] = await books().searchGoogleBooks('tolkien');
		expect(hobbit).toEqual({
			title: 'The Hobbit: Or There and Back Again',
			author: 'J.R.R. Tolkien',
			year: 2012,
			totalPages: 320,
			coverUrl: 'https://books.google.com/books/content?id=pD6arNyKyi8C&printsec=frontcover&img=1&zoom=2&source=gbs_api',
			googleBooksId: 'pD6arNyKyi8C',
			openLibraryId: '',
			releaseDate: '2012-09-18',
			url: '',
		});
		expect(silmarillion).toMatchObject({
			title: 'The Silmarillion',
			author: 'J.R.R. Tolkien, Christopher Tolkien',
			year: 1999,
			releaseDate: '1999-01-01',
			coverUrl: '',
			url: 'https://books.google.com/books/about/The_Silmarillion.html?id=ABC123',
		});
	});

	it('keeps the entry when its fields have the wrong type', async () => {
		respond({ items: [null, 7, 'x', { id: 5, volumeInfo: { title: 7, authors: 'x', pageCount: '12', publishedDate: 1999, imageLinks: { large: 3 }, infoLink: {} } }] });
		expect(await books().searchGoogleBooks('x')).toEqual([{
			title: '', author: '', year: 0, totalPages: 0, coverUrl: '', googleBooksId: '', openLibraryId: '', releaseDate: '', url: '',
		}]);
	});

	it.each([['a string', 'x'], ['null', null], ['an object', {}]])('has no results when items is %s', async (_name, items) => {
		respond({ items });
		expect(await books().searchGoogleBooks('x')).toEqual([]);
	});

	it('reports the connection from whether items is a list', async () => {
		respond(googleVolumes);
		expect(await books().checkGoogleBooksConnection()).toBe(true);
		respond({ items: 'x' });
		expect(await books().checkGoogleBooksConnection()).toBe(false);
	});

	it('resolves a volume by id and drops one without an id', async () => {
		respond(googleVolumes.items[0]);
		expect(await books().getGoogleBookById('pD6arNyKyi8C')).toMatchObject({ googleBooksId: 'pD6arNyKyi8C', totalPages: 320 });
		respond({ id: 5, volumeInfo: null });
		expect(await books().getGoogleBookById('x')).toBeNull();
		respond({ id: 'v', volumeInfo: null });
		expect(await books().getGoogleBookById('v')).toMatchObject({ googleBooksId: 'v', title: '' });
		respond([]);
		expect(await books().getGoogleBookById('v')).toBeNull();
	});
});

describe('Jikan manga', () => {
	it('maps a real search result', async () => {
		respond(jikanManga);
		expect(await manga().searchManga('berserk')).toEqual([{
			malId: 2,
			title: 'Berserk',
			author: 'Miura, Kentarou',
			year: 1989,
			totalChapters: 0,
			totalVolumes: 42,
			coverUrl: 'https://cdn.myanimelist.net/images/manga/1/157897l.jpg',
			releaseDate: '1989-08-25',
			url: 'https://myanimelist.net/manga/2/Berserk',
		}]);
	});

	it('keeps the entry when its fields have the wrong type', async () => {
		respond({ data: ['junk', null, { mal_id: '2', title: null, title_english: 5, authors: 'x', chapters: 'a', volumes: {}, published: { from: 3 }, images: { jpg: null }, url: 7 }] });
		expect(await manga().searchManga('x')).toEqual([{
			malId: 0, title: '', author: '', year: 0, totalChapters: 0, totalVolumes: 0, coverUrl: '', releaseDate: '', url: 'https://myanimelist.net/manga/0',
		}]);
	});

	it('falls back from the large cover to the small one and from an English title to the original', async () => {
		respond({ data: [{ mal_id: 9, title: 'Original', title_english: null, authors: [{}, 3], images: { jpg: { image_url: 'https://x.test/s.jpg', large_image_url: 5 } } }] });
		expect(await manga().searchManga('x')).toMatchObject([{ title: 'Original', coverUrl: 'https://x.test/s.jpg', author: '' }]);
	});

	it('looks up one manga and gives null for a missing or wrong-typed data', async () => {
		respond({ data: jikanManga.data[0] });
		expect(await manga().getMangaByMalId(2)).toMatchObject({ malId: 2, totalVolumes: 42 });
		respond({ data: 'x' });
		expect(await manga().getMangaByMalId(2)).toBeNull();
		respond({});
		expect(await manga().getMangaByMalId(2)).toBeNull();
		route([]);
		expect(await manga().getMangaByMalId(2)).toBeNull();
	});
});

describe('RAWG', () => {
	it('maps a real search result and drops games without id or name', async () => {
		respond({ results: [rawgGame, { id: '1', name: 'x' }, { id: 2, name: 5 }, null] });
		expect(await rawg().searchRawgGames('gta')).toEqual([{
			source: 'rawg',
			id: 3498,
			title: 'Grand Theft Auto V',
			releaseDate: '2013-09-17',
			coverUrl: 'https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg',
			platforms: ['PC', 'PlayStation 5'],
			url: 'https://rawg.io/games/grand-theft-auto-v',
		}]);
	});

	it('keeps a game whose other fields have the wrong type', async () => {
		respond({ results: [{ id: 3, name: 'Ok', platforms: 'x', background_image: 7, released: 1, slug: {} }] });
		expect(await rawg().searchRawgGames('x')).toEqual([{
			source: 'rawg', id: 3, title: 'Ok', releaseDate: '', coverUrl: '', platforms: [], url: '',
		}]);
	});

	it('reports the connection from whether results is a list', async () => {
		respond({ results: [] });
		expect(await rawg().checkRawgConnection()).toBe(true);
		respond({ results: 'x' });
		expect(await rawg().checkRawgConnection()).toBe(false);
	});

	it('maps the details with developers, modes and the best store link', async () => {
		route([['/stores', rawgStores], ['/games/3498', rawgGame]]);
		expect(await rawg().getRawgGameDetails(3498)).toMatchObject({
			id: 3498,
			developer: 'Rockstar North',
			publisher: 'Rockstar Games',
			singleplayer: true,
			coop: true,
			multiplayer: true,
			storeUrl: 'https://www.gog.com/game/gta_v',
		});
	});

	it('takes the first https store when none is a preferred one, and none when the stores fail', async () => {
		route([['/stores', { results: [{ store_id: 3, url: 'http://insecure.test' }, { store_id: 4, url: 'https://shop.test/a' }] }], ['/games/1', rawgGame]]);
		expect((await rawg().getRawgGameDetails(1))?.storeUrl).toBe('https://shop.test/a');
		route([['/games/1', rawgGame]]);
		expect((await rawg().getRawgGameDetails(1))?.storeUrl).toBe('');
	});

	it('ignores non-English tag slugs', async () => {
		route([['/stores', {}], ['/games/1', { id: 1, name: 'G', tags: [{ slug: 'pvp', language: 'rus' }, { slug: 'singleplayer' }] }]]);
		expect(await rawg().getRawgGameDetails(1)).toMatchObject({ singleplayer: true, multiplayer: false, coop: false });
	});

	it('builds the game from wrong-typed fields without throwing', async () => {
		route([
			['/stores', { results: [null, { url: 5 }, { store_id: 1 }] }],
			['/games/1', { id: 1, name: 'G', developers: 'x', publishers: [null, { name: 3 }], tags: [null, { slug: 5 }], platforms: {} }],
		]);
		expect(await rawg().getRawgGameDetails(1)).toMatchObject({
			title: 'G', developer: '', publisher: '', singleplayer: false, storeUrl: '', platforms: [],
		});
	});

	it.each([['a list', []], ['an id of the wrong type', { id: '1', name: 'x' }], ['no name', { id: 1 }]])('finds no game when the detail is %s', async (_name, detail) => {
		route([['/stores', {}], ['/games/1', detail]]);
		expect(await rawg().getRawgGameDetails(1)).toBeNull();
	});
});

describe('IGDB', () => {
	const token = { access_token: 'tok', expires_in: 3600 };

	it('maps a real search result and details', async () => {
		route([['id.twitch.tv', token], ['api.igdb.com', igdbGames]]);
		const api = igdb();
		const [game] = await api.searchIgdbGames('witcher');
		expect(game).toEqual({
			source: 'igdb',
			id: 1942,
			title: 'The Witcher 3: Wild Hunt',
			releaseDate: '2015-05-19',
			coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
			platforms: ['PC (Microsoft Windows)', 'PlayStation 4'],
			url: 'https://www.igdb.com/games/the-witcher-3-wild-hunt',
		});
		expect(await api.getIgdbGameDetails(1942)).toMatchObject({
			developer: 'CD Projekt RED',
			publisher: 'CD Projekt',
			singleplayer: true,
			coop: true,
			multiplayer: true,
			storeUrl: 'https://store.steampowered.com/app/292030',
		});
		expect(calls('id.twitch.tv')).toBe(1);
	});

	const sloppy = [null, { id: 'x', name: 1 }, { id: 5, name: 'Ok', cover: 'x', platforms: {}, first_release_date: 'soon', url: 7, game_modes: 'a', websites: [{ url: 4 }, null], involved_companies: [null, { developer: true, company: 3 }] }];

	it('keeps a game whose other fields have the wrong type', async () => {
		route([['id.twitch.tv', token], ['api.igdb.com', sloppy]]);
		expect(await igdb().searchIgdbGames('x')).toEqual([{
			source: 'igdb', id: 5, title: 'Ok', releaseDate: '', coverUrl: '', platforms: [], url: '',
		}]);
		expect(await igdb().getIgdbGameDetails(5)).toBeNull();
	});

	it('reads the first record of a sloppy details list', async () => {
		route([['id.twitch.tv', token], ['api.igdb.com', sloppy.slice(2)]]);
		expect(await igdb().getIgdbGameDetails(5)).toMatchObject({ title: 'Ok', developer: '', publisher: '', storeUrl: '', singleplayer: false });
	});

	it.each([['an object', {}], ['null', null], ['a string', 'x']])('finds nothing when IGDB answers with %s', async (_name, body) => {
		route([['id.twitch.tv', token], ['api.igdb.com', body]]);
		expect(await igdb().searchIgdbGames('x')).toEqual([]);
		expect(await igdb().getIgdbGameDetails(1)).toBeNull();
		expect(await igdb().checkIgdbConnection()).toBe(false);
	});

	it('reuses a token that has not expired', async () => {
		route([['id.twitch.tv', token], ['api.igdb.com', []]]);
		const api = igdb();
		await api.searchIgdbGames('a');
		await api.searchIgdbGames('b');
		expect(calls('id.twitch.tv')).toBe(1);
	});

	it('asks for a new token when none says how long it lasts', async () => {
		route([['id.twitch.tv', { access_token: 'tok' }], ['api.igdb.com', []]]);
		const api = igdb();
		await api.searchIgdbGames('a');
		await api.searchIgdbGames('b');
		expect(calls('id.twitch.tv')).toBe(2);
	});

	it.each([['missing', {}], ['of the wrong type', { access_token: 5, expires_in: 3600 }]])('rejects a token that is %s', async (_name, body) => {
		route([['id.twitch.tv', body]]);
		expect(await caught(igdb().searchIgdbGames('x'))).toMatchObject({ source: 'twitch', reason: 'auth' });
	});

	it('reports missing credentials, a rejected login and a dead network by their own reason', async () => {
		expect(await caught(new ApiService('').searchIgdbGames('x'))).toMatchObject({ source: 'twitch', reason: 'no-key' });
		route([['id.twitch.tv', 403]]);
		expect(await caught(igdb().searchIgdbGames('x'))).toMatchObject({ source: 'twitch', reason: 'auth' });
		route([]);
		expect(await caught(igdb().searchIgdbGames('x'))).toMatchObject({ source: 'twitch', reason: 'network' });
	});

	it('drops the token after a rejected query so the next one logs in again', async () => {
		route([['id.twitch.tv', token], ['api.igdb.com', 401]]);
		const api = igdb();
		const err = await caught(api.searchIgdbGames('x'));
		expect(err).toMatchObject({ source: 'igdb', reason: 'auth' });
		await caught(api.searchIgdbGames('x'));
		expect(calls('id.twitch.tv')).toBe(2);
		route([['id.twitch.tv', token], ['api.igdb.com', new Error('offline')]]);
		expect(await caught(igdb().searchIgdbGames('x'))).toMatchObject({ source: 'igdb', reason: 'network' });
	});
});

describe('Steam', () => {
	const ID = '76561198000000000';

	describe('resolveSteamId', () => {
		it.each([
			['an empty input', '', ''],
			['a SteamID64', ID, ID],
			['a profiles URL', `https://steamcommunity.com/profiles/${ID}/`, ID],
		])('takes %s as it is', async (_name, input, expected) => {
			expect(await steam().resolveSteamId(input)).toBe(expected);
			expect(sent).not.toHaveBeenCalled();
		});

		it.each([['a vanity URL', 'https://steamcommunity.com/id/gaben/?x=1'], ['a bare vanity name', 'gaben']])('resolves %s through the API', async (_name, input) => {
			route([['ResolveVanityURL', { response: { success: 1, steamid: ID } }]]);
			expect(await steam().resolveSteamId(input)).toBe(ID);
			expect(calls('vanityurl=gaben')).toBe(1);
		});

		it.each([
			['no match', { response: { success: 42 } }],
			['a steamid of the wrong type', { response: { success: 1, steamid: 5 } }],
			['no response', {}],
			['a response of the wrong type', { response: 'x' }],
			['a list', []],
		])('gives nothing for %s', async (_name, body) => {
			route([['ResolveVanityURL', body]]);
			expect(await steam().resolveSteamId('gaben')).toBe('');
		});

		it('gives nothing without an API key or while offline', async () => {
			expect(await new ApiService('').resolveSteamId('gaben')).toBe('');
			route([]);
			expect(await steam().resolveSteamId('gaben')).toBe('');
		});
	});

	describe('getSteamOwnedGames', () => {
		it('maps the real library', async () => {
			route([['GetOwnedGames', steamOwned]]);
			expect(await steam().getSteamOwnedGames()).toEqual({
				ok: true,
				reason: 'ok',
				games: [
					{ appId: '220', name: 'Half-Life 2', playtimeMinutes: 1234, lastPlayed: '2023-11-14T22:13:20.000Z' },
					{ appId: '440', name: 'Team Fortress 2', playtimeMinutes: 0, lastPlayed: null },
				],
			});
		});

		it('keeps the games whose fields have the wrong type and drops those without an appid', async () => {
			route([['GetOwnedGames', { response: { games: [null, { appid: 'x' }, { appid: 7, name: 3, playtime_forever: 'a', rtime_last_played: 'b' }] } }]]);
			expect(await steam().getSteamOwnedGames()).toEqual({
				ok: true, reason: 'ok', games: [{ appId: '7', name: '', playtimeMinutes: 0, lastPlayed: null }],
			});
		});

		it.each([
			['an empty response', { response: {} }, 'private'],
			['no response', {}, 'private'],
			['a games list of the wrong type', { response: { games: 'x', game_count: 3 } }, 'private'],
			['a count of zero', { response: { game_count: 0 } }, 'empty'],
		])('reads %s as a failure with the matching reason', async (_name, body, reason) => {
			route([['GetOwnedGames', body]]);
			expect(await steam().getSteamOwnedGames()).toEqual({ ok: false, reason, games: [] });
		});

		it.each([[401, 'badKey'], [403, 'badKey'], [500, 'network']])('reads HTTP %i as %s', async (status, reason) => {
			route([['GetOwnedGames', status]]);
			expect(await steam().getSteamOwnedGames()).toMatchObject({ ok: false, reason });
		});

		it('reports missing credentials and an offline network', async () => {
			expect(await new ApiService('').getSteamOwnedGames()).toMatchObject({ reason: 'missing' });
			route([]);
			expect(await steam().getSteamOwnedGames()).toMatchObject({ reason: 'network' });
		});
	});

	describe('getSteamAchievements', () => {
		it('counts the earned achievements of a real response', async () => {
			route([['GetPlayerAchievements', steamAchievements]]);
			expect(await steam().getSteamAchievements('220')).toEqual({ earned: 2, total: 3 });
		});

		it('counts only well-formed earned entries', async () => {
			route([['GetPlayerAchievements', { playerstats: { success: true, achievements: [null, { achieved: '1' }, { achieved: 1 }] } }]]);
			expect(await steam().getSteamAchievements('220')).toEqual({ earned: 1, total: 3 });
		});

		it.each([
			['a failure flag', { playerstats: { success: false, achievements: [] } }],
			['a flag of the wrong type', { playerstats: { success: 'yes', achievements: [] } }],
			['no list', { playerstats: { success: true } }],
			['a list of the wrong type', { playerstats: { success: true, achievements: {} } }],
			['no stats', {}],
		])('gives null for %s', async (_name, body) => {
			route([['GetPlayerAchievements', body]]);
			expect(await steam().getSteamAchievements('220')).toBeNull();
		});

		it('gives null for no achievements (400), no credentials and an offline network', async () => {
			route([['GetPlayerAchievements', 400]]);
			expect(await steam().getSteamAchievements('220')).toBeNull();
			expect(await new ApiService('').getSteamAchievements('220')).toBeNull();
			route([]);
			expect(await steam().getSteamAchievements('220')).toBeNull();
		});
	});

	describe('getSteamAppDetails', () => {
		it('maps the real store entry', async () => {
			route([['appdetails', steamAppDetails]]);
			expect(await steam().getSteamAppDetails('1145350')).toEqual({
				name: 'Hades II',
				developer: 'Supergiant Games',
				publisher: 'Supergiant Games',
				genres: ['Action', 'Adventure'],
				releaseDate: '2025-09-25',
				coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145350/library_600x900.jpg',
				storeUrl: 'https://store.steampowered.com/app/1145350/',
				singleplayer: true,
				coop: true,
				multiplayer: false,
			});
		});

		it('builds the entry from wrong-typed fields without throwing', async () => {
			route([['appdetails', { 5: { success: true, data: { name: 5, developers: 'x', publishers: [3, 'P'], genres: [null, { description: 3 }], categories: ['x', { id: 'a' }], release_date: { date: 'soon' } } } }]]);
			expect(await steam().getSteamAppDetails('5')).toMatchObject({
				name: '', developer: '', publisher: 'P', genres: [], releaseDate: null, singleplayer: false, coop: false, multiplayer: false,
			});
		});

		it.each([
			['a failure flag', { 5: { success: false, data: {} } }],
			['a flag of the wrong type', { 5: { success: 'yes', data: {} } }],
			['data of the wrong type', { 5: { success: true, data: 'x' } }],
			['another app', { 6: { success: true, data: {} } }],
			['a list', []],
		])('gives null for %s', async (_name, body) => {
			route([['appdetails', body]]);
			expect(await steam().getSteamAppDetails('5')).toBeNull();
		});

		it('gives null for a non-200 answer and an offline network', async () => {
			route([['appdetails', 429]]);
			expect(await steam().getSteamAppDetails('5')).toBeNull();
			route([]);
			expect(await steam().getSteamAppDetails('5')).toBeNull();
		});
	});
});
