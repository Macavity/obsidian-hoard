/** Which service a failed request went to. */
export type ApiSource = 'tmdb' | 'omdb' | 'jikan' | 'anilist' | 'googleBooks' | 'rawg' | 'igdb' | 'twitch' | 'cinemeta' | 'openLibrary' | 'steamStore' | 'unknown';

/** Why it failed. 'no-key' = none set; 'auth' = the credential was rejected. */
export type ApiErrorReason =
	| 'no-key' | 'auth' | 'not-enabled' | 'rate-limited' | 'not-found' | 'server' | 'http' | 'parse' | 'network';

/** A failed API request. The message is English and for developers; user text comes from the reason. */
export class ApiError extends Error {
	readonly source: ApiSource;
	readonly reason: ApiErrorReason;
	readonly status?: number;
	/** the service's own wording, when it sent one worth showing verbatim */
	readonly providerMessage?: string;

	constructor(
		source: ApiSource,
		reason: ApiErrorReason,
		message: string,
		facts: { status?: number; providerMessage?: string } = {},
	) {
		super(message);
		this.name = 'ApiError';
		this.source = source;
		this.reason = reason;
		this.status = facts.status;
		this.providerMessage = facts.providerMessage;
	}
}

const API_LABELS: Record<ApiSource, string> = {
	tmdb: 'TMDB',
	omdb: 'OMDb',
	jikan: 'MyAnimeList',
	anilist: 'AniList',
	googleBooks: 'Google Books',
	rawg: 'RAWG',
	igdb: 'IGDB',
	twitch: 'Twitch',
	cinemeta: 'Cinemeta',
	openLibrary: 'Open Library',
	steamStore: 'Steam Store',
	unknown: 'The API', // developer messages only; user text names the unknown service through i18n
};

/** Name of a service in developer-facing messages. */
export function apiLabel(source: ApiSource): string {
	return API_LABELS[source];
}

/** Sources that take no credential, so "rejected your credentials" can never be the cause. */
const KEYLESS_SOURCES: ReadonlySet<ApiSource> = new Set<ApiSource>(['jikan', 'anilist', 'cinemeta', 'openLibrary', 'steamStore']);

/** True for a service that takes no credential. */
export function isKeyless(source: ApiSource): boolean {
	return KEYLESS_SOURCES.has(source);
}

/** A response outside 2xx, as the rules see it. */
interface FailedResponse {
	source: ApiSource;
	status: number;
	body: string;
	/** the service takes no credential and none went out with the request */
	anonymous: boolean;
}

/** One line of the classification: every condition it names must hold. */
interface HttpRule {
	/** only for this service */
	source?: ApiSource;
	/** only for a request without a credential to a service that takes none */
	anonymous?: true;
	status: (status: number) => boolean;
	/** the body must match as well */
	body?: RegExp;
	reason: ApiErrorReason;
}

const denied = (status: number): boolean => status === 401 || status === 403;
const exactly = (code: number) => (status: number): boolean => status === code;

/**
 * Status and body → reason; the first rule that matches decides, no match is 'http'. A service's
 * special case goes above the general rule for the same status.
 */
const HTTP_RULES: readonly HttpRule[] = [
	// a service without credentials refusing to serve is an outage, never a bad credential:
	// AniList answers 403 with "the API has been temporarily disabled" during theirs
	{ anonymous: true, status: denied, reason: 'server' },
	// OMDb answers 401 for a bad key and for an exhausted quota alike
	{ source: 'omdb', status: denied, body: /limit/i, reason: 'rate-limited' },
	// Google's 403 covers a disabled API, a spent quota and a bad key
	{ source: 'googleBooks', status: exactly(403), body: /accessNotConfigured/i, reason: 'not-enabled' },
	{ source: 'googleBooks', status: exactly(403), body: /rateLimitExceeded|dailyLimitExceeded|userRateLimitExceeded/i, reason: 'rate-limited' },
	{ status: denied, reason: 'auth' },
	{ status: exactly(429), reason: 'rate-limited' },
	{ status: exactly(404), reason: 'not-found' },
	{ status: (status) => status >= 500, reason: 'server' },
];

function matches(rule: HttpRule, failed: FailedResponse): boolean {
	return (rule.source === undefined || rule.source === failed.source)
		&& (rule.anonymous === undefined || failed.anonymous)
		&& rule.status(failed.status)
		&& (rule.body === undefined || rule.body.test(failed.body));
}

/**
 * The service's own explanation, when the body carries one: GraphQL `errors[0].message` (AniList,
 * on failed and 200 responses alike) or a top-level `message` (Jikan says which upstream broke).
 * '' when there is none.
 */
function providerMessageFrom(body: string): string {
	try {
		const data = JSON.parse(body) as { errors?: Array<{ message?: string }>; message?: unknown } | null;
		const gql = Array.isArray(data?.errors) ? (data.errors[0]?.message ?? '').trim() : '';
		if (gql) return gql;
		return typeof data?.message === 'string' ? data.message.trim() : '';
	} catch {
		return '';
	}
}

/**
 * The error for a response outside 2xx. `credentialSent`: the request carried a login for a
 * service that also answers without one, so a 401 or 403 is that login being rejected.
 */
export function httpError(source: ApiSource, status: number, body: string, credentialSent = false): ApiError {
	const failed: FailedResponse = { source, status, body, anonymous: KEYLESS_SOURCES.has(source) && !credentialSent };
	const reason = HTTP_RULES.find((rule) => matches(rule, failed))?.reason ?? 'http';
	return new ApiError(source, reason, `${API_LABELS[source]} returned ${status}`, {
		status,
		providerMessage: providerMessageFrom(body),
	});
}
