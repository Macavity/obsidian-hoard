import { t, type TranslationKey } from '../i18n';
import type { LookupResult } from './lookup';
import { at, readString } from '../domain/read';

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
		const data: unknown = JSON.parse(body);
		return readString(at(data, 'errors', 0, 'message')).trim() || readString(at(data, 'message')).trim();
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

/** What follows from a reason: how it reads, and what a background check and a detail lookup do with it. */
interface ReasonRule {
	/** chip label; may name {status} */
	short: TranslationKey;
	/** the sentence; may name {service} and {status} */
	text: TranslationKey;
	/** services with a sentence of their own for this reason */
	textFor?: Partial<Record<ApiSource, TranslationKey>>;
	/** the sentence for a service that takes no credential */
	textKeyless?: TranslationKey;
	/** failed = worth retrying soon, nokey = no usable credential, notfound = nothing for this identity */
	outcome: Exclude<LookupResult<never>['status'], 'found'>;
	/** the credential is the cause: the one failure that must never read as "not found" */
	credential?: true;
	/** the service's own explanation, when it sent one, says more than our status code */
	providerExplains?: true;
}

/** One row per reason. A new reason does not compile until its row is complete. */
const REASONS: Record<ApiErrorReason, ReasonRule> = {
	'no-key': {
		short: 'notices.api.short.noKey',
		text: 'notices.api.keyRequired',
		textFor: { tmdb: 'notices.api.tmdbTokenRequired' },
		outcome: 'nokey',
	},
	auth: {
		short: 'notices.api.short.auth',
		text: 'notices.api.auth.other',
		textFor: {
			// the v3 key and the v4 token sit side by side on TMDB's own settings page
			tmdb: 'notices.api.auth.tmdb',
			omdb: 'notices.api.auth.omdb',
			googleBooks: 'notices.api.auth.googleBooks',
			rawg: 'notices.api.auth.rawg',
			twitch: 'notices.api.auth.twitch',
			igdb: 'notices.api.auth.igdb',
		},
		outcome: 'nokey',
		credential: true,
	},
	'not-enabled': {
		short: 'notices.api.short.notEnabled',
		text: 'notices.api.notEnabled',
		outcome: 'nokey',
		credential: true,
	},
	'rate-limited': {
		short: 'notices.api.short.rateLimited',
		text: 'notices.api.rateLimited.other',
		textFor: {
			omdb: 'notices.api.rateLimited.omdb',
			jikan: 'notices.api.rateLimited.jikan',
			anilist: 'notices.api.rateLimited.anilist',
			googleBooks: 'notices.api.rateLimited.googleBooks',
		},
		outcome: 'failed',
	},
	'not-found': { short: 'notices.api.short.notFound', text: 'notices.api.notFound', outcome: 'notfound' },
	server: {
		short: 'notices.api.short.server',
		text: 'notices.api.server',
		textKeyless: 'notices.api.serverKeyless',
		outcome: 'failed',
		providerExplains: true,
	},
	http: { short: 'notices.api.short.http', text: 'notices.api.failed', outcome: 'failed', providerExplains: true },
	parse: { short: 'notices.api.short.parse', text: 'notices.api.parse', outcome: 'failed' },
	network: { short: 'notices.api.short.network', text: 'notices.api.network', outcome: 'failed' },
};

/** Service name for user text; the unknown source reads "The API" in the user's language. */
function serviceName(source: ApiSource): string {
	return source === 'unknown' ? t('notices.api.unknownService') : API_LABELS[source];
}

function sentenceKey(rule: ReasonRule, source: ApiSource): TranslationKey {
	const keyless = KEYLESS_SOURCES.has(source) ? rule.textKeyless : undefined;
	return rule.textFor?.[source] ?? keyless ?? rule.text;
}

const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Maps any error from an API call to a short, user-facing explanation. */
export function apiErrorMessage(err: unknown): string {
	if (!(err instanceof ApiError)) return t('notices.api.requestFailed');
	const rule = REASONS[err.reason];
	const service = serviceName(err.source);
	// only where we have nothing better than a status code: our own auth / quota / no-key wording
	// names the actual fix, which beats a terse provider string like Twitch's "invalid client"
	if (rule.providerExplains && err.providerMessage) {
		return t('notices.api.providerMessage', { service, text: asSentence(err.providerMessage) });
	}
	return t(sentenceKey(rule, err.source), { service, status: err.status ?? '?' });
}

/** Chip-sized label for the same error; the full sentence goes in a detail line. */
export function apiErrorShort(err: unknown): string {
	if (!(err instanceof ApiError)) return t('notices.api.short.failed');
	return t(REASONS[err.reason].short, { status: err.status ?? '?' });
}

/** A source's failure as a lookup outcome; anything that is no ApiError is worth a retry. */
export function lookupOfError(err: unknown): LookupResult<never> {
	return { status: err instanceof ApiError ? REASONS[err.reason].outcome : 'failed' };
}

/**
 * Detail lookups keep their "null = not found" contract, but a rejected credential must never be
 * reported as a missing title: that is the failure users misdiagnose. Re-throws only those.
 */
export function rethrowAuth(err: unknown): void {
	if (err instanceof ApiError && REASONS[err.reason].credential) throw err;
}
