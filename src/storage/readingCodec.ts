import { READING_STATUSES } from '../types';
import type { Book, Manga, EntryAirtime, AirtimeRecurrence, ReadingStatus } from '../types';
import type { Decoded } from './storageTypes';
import { parseExternalId, formatExternalId } from './externalId';
import { AIRTIME_PROPS as A, COMMON_PROPS as C, READING_PROPS as R } from './properties';

type Fm = Record<string, unknown>;

/** Typed frontmatter reader; a present value of the wrong type is recorded and replaced by the fallback. */
export class FmReader {
	readonly invalidFields: string[] = [];
	constructor(readonly fm: Fm) {}

	private has(key: string): boolean {
		const v = this.fm[key];
		return v !== undefined && v !== null && v !== '';
	}
	private bad(key: string): void {
		if (!this.invalidFields.includes(key)) this.invalidFields.push(key);
	}

	str(key: string, fallback = ''): string {
		const v = this.fm[key];
		if (!this.has(key)) return fallback;
		if (typeof v === 'string') return v;
		if (typeof v === 'number') return String(v);
		this.bad(key);
		return fallback;
	}
	/** String that may be absent; null/empty both read as null. */
	strOrNull(key: string): string | null {
		const v = this.fm[key];
		if (!this.has(key)) return null;
		if (typeof v === 'string') return v;
		this.bad(key);
		return null;
	}
	num(key: string, fallback = 0): number {
		const v = this.fm[key];
		if (!this.has(key)) return fallback;
		if (typeof v === 'number' && Number.isFinite(v)) return v;
		this.bad(key);
		return fallback;
	}
	bool(key: string): boolean {
		const v = this.fm[key];
		if (!this.has(key)) return false;
		if (typeof v === 'boolean') return v;
		this.bad(key);
		return false;
	}
	list(key: string): string[] {
		const v = this.fm[key];
		if (!this.has(key)) return [];
		if (typeof v === 'string') return [v];
		if (Array.isArray(v) && v.every(x => typeof x === 'string')) return v;
		this.bad(key);
		return [];
	}
}

const RECURRENCES: readonly AirtimeRecurrence[] = ['once', 'daily', 'weekly', 'monthly'];

export function decodeAirtime(r: FmReader): EntryAirtime | undefined {
	const rec = r.str(A.recurrence);
	if (!rec) return undefined;
	if (!(RECURRENCES as readonly string[]).includes(rec)) {
		r.invalidFields.push(A.recurrence);
		return undefined;
	}
	const a: EntryAirtime = { recurrence: rec as AirtimeRecurrence };
	if (r.fm[A.day] != null && r.fm[A.day] !== '') a.day = r.num(A.day);
	const time = r.str(A.time);
	if (time) a.time = time;
	if (r.fm[A.season] != null && r.fm[A.season] !== '') a.season = r.num(A.season);
	if (r.fm[A.episode] != null && r.fm[A.episode] !== '') a.episode = r.num(A.episode);
	const ack = r.str(A.acknowledged);
	if (ack) a.acknowledged = ack;
	return a;
}

export function encodeAirtime(a: EntryAirtime | undefined, out: Fm): void {
	if (!a) return;
	out[A.recurrence] = a.recurrence;
	if (a.day !== undefined) out[A.day] = a.day;
	if (a.time) out[A.time] = a.time;
	if (a.season !== undefined) out[A.season] = a.season;
	if (a.episode !== undefined) out[A.episode] = a.episode;
	if (a.acknowledged) out[A.acknowledged] = a.acknowledged;
}

function decodeCustomFields(r: FmReader): Record<string, string | number> {
	const cf: Record<string, string | number> = {};
	for (const [k, v] of Object.entries(r.fm)) {
		if (!k.startsWith('cf_') || k.length === 3) continue;
		if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) cf[k.slice(3)] = v;
		else if (v !== null && v !== undefined) r.invalidFields.push(k);
	}
	return cf;
}

function status(r: FmReader): ReadingStatus {
	const s = r.str(C.status);
	if ((READING_STATUSES as string[]).includes(s)) return s as ReadingStatus;
	if (s) r.invalidFields.push(C.status);
	return 'Plan to Read';
}

/** Keys shared by Book and Manga, in the order the first writer emitted them. */
function encodeCommon(e: Book | Manga, out: Fm): void {
	out[C.name] = e.title;
	out[R.author] = e.author ?? '';
	out[C.status] = e.status;
	if (e.favorite) out[C.favorite] = true;
	if (e.dateFavorited) out[C.dateFavorited] = e.dateFavorited;
	out[C.rating] = e.rating | 0;
}

function encodeTail(e: Book | Manga, kind: 'book' | 'manga', out: Fm): void {
	out[C.dateStarted] = e.dateStarted ?? null;
	out[C.dateFinished] = e.dateFinished ?? null;
	out[C.releaseDate] = e.releaseDate ?? null;
	out[C.dateAdded] = e.dateAdded;
	out[C.dateModified] = e.dateModified;
	if (e.coverUrl) out[C.cover] = e.coverUrl;
	if (e.externalLink) out[C.url] = e.externalLink;
	if (e.groups?.length) out[C.groups] = [...e.groups];
	encodeAirtime(e.airtime, out);
	for (const [k, v] of Object.entries(e.customFields ?? {})) out[`cf_${k}`] = v;
	out[C.type] = kind;
}

type ReadingCommon = Pick<Book & Manga,
	'id' | 'title' | 'author' | 'status' | 'favorite' | 'dateFavorited' | 'rating' | 'chaptersRead' | 'totalChapters'
	| 'coverUrl' | 'externalLink' | 'vaultPage' | 'dateStarted' | 'dateFinished' | 'releaseDate' | 'dateAdded'
	| 'dateModified' | 'customFields' | 'groups' | 'airtime'>;

/** Fields decoded identically for Book and Manga. */
function decodeReadingCommon(id: string, r: FmReader): ReadingCommon {
	return {
		id,
		title: r.str(C.name),
		author: r.str(R.author),
		status: status(r),
		favorite: r.bool(C.favorite) || undefined,
		dateFavorited: r.strOrNull(C.dateFavorited) ?? undefined,
		rating: r.num(C.rating),
		chaptersRead: r.num(R.chaptersRead),
		totalChapters: r.num(R.totalChapters),
		coverUrl: r.str(C.cover),
		externalLink: r.strOrNull(C.url) ?? undefined,
		vaultPage: `${id}.md`,
		dateStarted: r.strOrNull(C.dateStarted),
		dateFinished: r.strOrNull(C.dateFinished),
		releaseDate: r.strOrNull(C.releaseDate),
		dateAdded: r.str(C.dateAdded),
		dateModified: r.str(C.dateModified),
		customFields: decodeCustomFields(r),
		groups: r.list(C.groups),
		airtime: decodeAirtime(r),
	};
}

/** Optional keys are absent, not empty, on a decoded entry. */
function stripEmptyOptional(entry: Book | Manga): void {
	if (!entry.favorite) delete entry.favorite;
	if (!entry.dateFavorited) delete entry.dateFavorited;
	if (!entry.externalLink) delete entry.externalLink;
	if (!entry.groups?.length) delete entry.groups;
	if (!entry.airtime) delete entry.airtime;
}

export function decodeBook(id: string, fm: Fm): Decoded<Book> {
	const r = new FmReader(fm);
	const ext = parseExternalId(r.str(C.externalId));
	const gbooks = ext?.source === 'gbooks' ? ext.id : '';
	const entry: Book = {
		...decodeReadingCommon(id, r),
		progressUnit: r.str(R.progressUnit) === 'words' ? 'words' : 'pages',
		pagesRead: r.num(R.pagesRead),
		totalPages: r.num(R.totalPages),
		wordsRead: r.num(R.wordsRead),
		totalWords: r.num(R.totalWords),
		googleBooksId: r.str(R.googleBooksId) || gbooks,
	};
	stripEmptyOptional(entry);
	return { entry, invalidFields: r.invalidFields };
}

export function encodeBook(b: Book): Fm {
	const out: Fm = {};
	encodeCommon(b, out);
	out[R.pagesRead] = b.pagesRead | 0;
	out[R.totalPages] = b.totalPages | 0;
	// words are opt-in: emitted only when they carry meaning
	if (b.progressUnit === 'words' || (b.wordsRead | 0) > 0 || (b.totalWords | 0) > 0) {
		out[R.progressUnit] = b.progressUnit === 'words' ? 'words' : 'pages';
		out[R.wordsRead] = b.wordsRead | 0;
		out[R.totalWords] = b.totalWords | 0;
	}
	out[R.chaptersRead] = b.chaptersRead | 0;
	out[R.totalChapters] = b.totalChapters | 0;
	if (b.googleBooksId) {
		out[R.googleBooksId] = b.googleBooksId;
		out[C.externalId] = formatExternalId({ source: 'gbooks', id: b.googleBooksId });
	}
	encodeTail(b, 'book', out);
	return out;
}

export function decodeManga(id: string, fm: Fm): Decoded<Manga> {
	const r = new FmReader(fm);
	const ext = parseExternalId(r.str(C.externalId));
	const mal = ext?.source === 'mal' && ext.kind === 'manga' ? ext.id : '';
	const entry: Manga = {
		...decodeReadingCommon(id, r),
		volumesRead: r.num(R.volumesRead),
		totalVolumes: r.num(R.totalVolumes),
		malId: r.str(R.malId) || mal,
	};
	stripEmptyOptional(entry);
	return { entry, invalidFields: r.invalidFields };
}

export function encodeManga(m: Manga): Fm {
	const out: Fm = {};
	encodeCommon(m, out);
	out[R.chaptersRead] = m.chaptersRead | 0;
	out[R.totalChapters] = m.totalChapters | 0;
	out[R.volumesRead] = m.volumesRead | 0;
	out[R.totalVolumes] = m.totalVolumes | 0;
	if (m.malId) {
		out[R.malId] = Number.isFinite(Number(m.malId)) ? Number(m.malId) : m.malId;
		out[C.externalId] = formatExternalId({ source: 'mal', kind: 'manga', id: m.malId });
	}
	encodeTail(m, 'manga', out);
	return out;
}
