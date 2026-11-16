import { requestUrl } from 'obsidian';
import { vi } from 'vitest';
import { ApiService, requestVia } from '../../src/ApiService';
import { TENRAI_BASE, resolveJikanEndpoint } from '../../src/jikanBase';

/** The network stand-in from the obsidian mock. */
export const sent = vi.mocked(requestUrl);

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TOKEN_REPLY = { status: 200, text: '{"access_token":"tok","expires_in":3600}', json: { access_token: 'tok', expires_in: 3600 } };

export const urlOfCall = (params: unknown): string => (params as { url: string }).url;

function parsed(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

/** A response with this status and body; `json` is the parsed body, null when it is not JSON. */
export const reply = (status: number, text = ''): { status: number; text: string; json: unknown } =>
	({ status, text, json: parsed(text) });

/** What the stand-in answers with. */
export type Reply = ReturnType<typeof reply>;

export const isTokenRequest = (params: unknown): boolean => urlOfCall(params).startsWith(TWITCH_TOKEN_URL);

/** Sets how the stand-in answers; the real return type is Obsidian's promise with extras nothing here reads. */
export function respondWith(respond: (params: unknown) => Promise<Reply>): void {
	sent.mockImplementation(respond as never);
}

/** Every request gets the same answer. */
export function answerAll(status: number, text = ''): void {
	respondWith(() => Promise.resolve(reply(status, text)));
}

/**
 * Answers by URL: the first route whose text the URL contains decides (JSON body, 200); a URL
 * no route knows gets a 404. The Twitch token request always succeeds.
 */
export function route(routes: Array<[string, unknown]>): void {
	respondWith((params) => {
		if (isTokenRequest(params)) return Promise.resolve(TOKEN_REPLY);
		const url = urlOfCall(params);
		const hit = routes.find(([part]) => url.includes(part));
		return Promise.resolve(hit ? reply(200, JSON.stringify(hit[1])) : reply(404));
	});
}

/** The Twitch token request succeeds, every other request gets what `respond` gives. */
export function afterToken(respond: () => Promise<Reply>): void {
	respondWith((params) => (isTokenRequest(params) ? Promise.resolve(TOKEN_REPLY) : respond()));
}

/** A fresh service per call: the Jikan and AniList throttles are per instance. */
const keyed = (): ApiService => new ApiService('okey', 'ttoken', 'gkey', 'rkey', 'iid', 'isecret');

/** One public entry point per service whose rejection carries the request's ApiError. */
export const CALLS = {
	tmdb: () => keyed().checkTmdbConnection(),
	omdb: () => keyed().checkOmdbConnection(),
	jikan: () => keyed().pingJikan(),
	jikanLogin: () => {
		const api = keyed();
		api.setJikanEndpoint(resolveJikanEndpoint('https://a:b@nas.example.org/v4'));
		return api.pingJikan();
	},
	anilist: () => keyed().searchAniList('x'),
	googleBooks: () => keyed().checkGoogleBooksConnection(),
	rawg: () => keyed().checkRawgConnection(),
	/** the token request itself gets the answer */
	twitch: () => keyed().checkIgdbConnection(),
	/** the token request succeeds, the query gets the answer */
	igdb: () => keyed().checkIgdbConnection(),
	cinemeta: () => keyed().searchCinemeta('x', 'movie'),
	openLibrary: () => keyed().searchOpenLibrary('x'),
	steamStore: () => keyed().searchSteamStore('x'),
	unknown: () => requestVia({ base: TENRAI_BASE, headers: {} }, { url: 'https://example.org/x' }),
} satisfies Record<string, () => Promise<unknown>>;

export type Service = keyof typeof CALLS;

/** Sets what the service's own request gets; for IGDB the token request before it succeeds. */
export function answerWith(service: Service, respond: () => Promise<Reply>): void {
	if (service === 'igdb') afterToken(respond);
	else respondWith(respond);
}

export function answer(service: Service, status: number, text = ''): void {
	answerWith(service, () => Promise.resolve(reply(status, text)));
}

/** The value a call rejects with; fails when it resolves. */
export async function failure(call: () => Promise<unknown>): Promise<unknown> {
	try {
		await call();
	} catch (err) {
		return err;
	}
	throw new Error('expected the call to reject');
}
