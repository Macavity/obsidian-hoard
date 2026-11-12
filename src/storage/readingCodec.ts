import { READING_STATUSES } from '../types';
import type { Book, Manga, EntryAirtime, AirtimeRecurrence, ReadingCustomColumn, ReadingStatus } from '../types';
import type { Decoded, Fm } from './storageTypes';
import { parseExternalId, formatExternalId } from './externalId';
import { AIRTIME_PROPS as A, COMMON_PROPS as C, READING_PROPS as R, customFieldKey } from './properties';

type Columns = readonly ReadingCustomColumn[];

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

/** Airtime properties of an entry; empty when it has no schedule. */
export function airtimeProps(a: EntryAirtime | undefined): Record<string, unknown> {
	if (!a) return {};
	return {
		[A.recurrence]: a.recurrence,
		...(a.day !== undefined ? { [A.day]: a.day } : {}),
		...(a.time ? { [A.time]: a.time } : {}),
		...(a.season !== undefined ? { [A.season]: a.season } : {}),
		...(a.episode !== undefined ? { [A.episode]: a.episode } : {}),
		...(a.acknowledged ? { [A.acknowledged]: a.acknowledged } : {}),
	};
}

/** Writes the airtime properties into a frontmatter object that is edited in place (processFrontMatter). */
export function encodeAirtime(a: EntryAirtime | undefined, out: Fm): void {
	Object.assign(out, airtimeProps(a));
}

/** Reads `Custom <name>` for each column; keys of unknown columns are ignored and stay in the note. */
function decodeCustomFields(r: FmReader, columns: Columns): Record<string, string | number> {
	const cf: Record<string, string | number> = {};
	for (const col of columns) {
		const key = customFieldKey(col.name);
		const v = r.fm[key];
		if (v === null || v === undefined || v === '') continue;
		if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) cf[col.id] = v;
		else r.invalidFields.push(key);
	}
	return cf;
}

function encodeCustomFields(e: Book | Manga, columns: Columns, out: Fm): void {
	for (const col of columns) {
		const v = e.customFields?.[col.id];
		if (v !== undefined && col.name.trim()) out[customFieldKey(col.name)] = v;
	}
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

function encodeTail(e: Book | Manga, kind: 'book' | 'manga', columns: Columns, out: Fm): void {
	out[C.dateStarted] = e.dateStarted ?? null;
	out[C.dateFinished] = e.dateFinished ?? null;
	out[C.releaseDate] = e.releaseDate ?? null;
	out[C.dateAdded] = e.dateAdded;
	out[C.dateModified] = e.dateModified;
	if (e.coverUrl) out[C.cover] = e.coverUrl;
	if (e.externalLink) out[C.url] = e.externalLink;
	if (e.groups?.length) out[C.groups] = [...e.groups];
	encodeAirtime(e.airtime, out);
	encodeCustomFields(e, columns, out);
	out[C.type] = kind;
}

type ReadingCommon = Pick<Book & Manga,
	'id' | 'title' | 'author' | 'status' | 'favorite' | 'dateFavorited' | 'rating' | 'chaptersRead' | 'totalChapters'
	| 'coverUrl' | 'externalLink' | 'vaultPage' | 'dateStarted' | 'dateFinished' | 'releaseDate' | 'dateAdded'
	| 'dateModified' | 'customFields' | 'groups' | 'airtime'>;

/** Fields decoded identically for Book and Manga. */
function decodeReadingCommon(id: string, r: FmReader, columns: Columns): ReadingCommon {
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
		customFields: decodeCustomFields(r, columns),
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

export function decodeBook(id: string, fm: Record<string, unknown>, columns: readonly ReadingCustomColumn[]): Decoded<Book> {
	const r = new FmReader(fm);
	const ext = parseExternalId(r.str(C.externalId));
	const gbooks = ext?.source === 'gbooks' ? ext.id : '';
	const entry: Book = {
		...decodeReadingCommon(id, r, columns),
		progressUnit: r.str(R.progressUnit) === 'words' ? 'words' : 'pages',
		pagesRead: r.num(R.pagesRead),
		totalPages: r.num(R.totalPages),
		wordsRead: r.num(R.wordsRead),
		totalWords: r.num(R.totalWords),
		googleBooksId: r.str(R.googleBooksId) || gbooks,
		openLibraryId: ext?.source === 'openlibrary' ? ext.id : '',
	};
	stripEmptyOptional(entry);
	return { entry, invalidFields: r.invalidFields };
}

export function encodeBook(b: Book, columns: readonly ReadingCustomColumn[]): Record<string, unknown> {
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
	// lossless for both ids: the Google Books ID has its own property, so Open Library takes the External ID
	if (b.googleBooksId) out[R.googleBooksId] = b.googleBooksId;
	if (b.openLibraryId) out[C.externalId] = formatExternalId({ source: 'openlibrary', id: b.openLibraryId });
	else if (b.googleBooksId) out[C.externalId] = formatExternalId({ source: 'gbooks', id: b.googleBooksId });
	encodeTail(b, 'book', columns, out);
	return out;
}

export function decodeManga(id: string, fm: Record<string, unknown>, columns: readonly ReadingCustomColumn[]): Decoded<Manga> {
	const r = new FmReader(fm);
	const ext = parseExternalId(r.str(C.externalId));
	const mal = ext?.source === 'mal' && ext.kind === 'manga' ? ext.id : '';
	const entry: Manga = {
		...decodeReadingCommon(id, r, columns),
		volumesRead: r.num(R.volumesRead),
		totalVolumes: r.num(R.totalVolumes),
		malId: r.str(R.malId) || mal,
	};
	stripEmptyOptional(entry);
	return { entry, invalidFields: r.invalidFields };
}

export function encodeManga(m: Manga, columns: readonly ReadingCustomColumn[]): Record<string, unknown> {
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
	encodeTail(m, 'manga', columns, out);
	return out;
}
