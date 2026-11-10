import type { BookSearchResult } from './ApiService';

const OPEN_LIBRARY_BASE = 'https://openlibrary.org';

const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i';
const WORK_KEY_RE = /^\/works\/(OL\d+W)$/;
const YEAR_RE = /\b(\d{4})\b/;

export function openLibrarySearchUrl(query: string): string {
	return `${OPEN_LIBRARY_BASE}/search.json?q=${encodeURIComponent(query)}&limit=10&fields=${SEARCH_FIELDS}`;
}

export function openLibraryWorkUrl(id: string): string {
	return `${OPEN_LIBRARY_BASE}/works/${id}.json`;
}

export function openLibraryCoverUrl(coverId: number): string {
	return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function workId(key: unknown): string | null {
	return typeof key === 'string' ? (WORK_KEY_RE.exec(key)?.[1] ?? null) : null;
}

function nonNegInt(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function coverUrlOf(coverId: unknown): string {
	const id = nonNegInt(coverId);
	return id > 0 ? openLibraryCoverUrl(id) : '';
}

function authorsOf(value: unknown): string {
	return Array.isArray(value) ? value.filter((a): a is string => typeof a === 'string').join(', ') : '';
}

function build(id: string, title: string, fields: Partial<BookSearchResult>): BookSearchResult {
	return {
		title,
		author: '',
		year: 0,
		totalPages: 0,
		coverUrl: '',
		googleBooksId: '',
		openLibraryId: id,
		releaseDate: '',
		url: `${OPEN_LIBRARY_BASE}/works/${id}`,
		...fields,
	};
}

function mapDoc(raw: unknown): BookSearchResult | null {
	const doc = asRecord(raw);
	const id = doc && workId(doc.key);
	if (!doc || !id || typeof doc.title !== 'string') return null;
	return build(id, doc.title, {
		author: authorsOf(doc.author_name),
		year: nonNegInt(doc.first_publish_year),
		totalPages: nonNegInt(doc.number_of_pages_median),
		coverUrl: coverUrlOf(doc.cover_i),
	});
}

export function mapOpenLibrarySearch(json: unknown): BookSearchResult[] {
	const docs = asRecord(json)?.docs;
	if (!Array.isArray(docs)) return [];
	return docs.map(mapDoc).filter((r): r is BookSearchResult => r !== null);
}

function yearOf(value: unknown): number {
	return typeof value === 'string' ? Number(YEAR_RE.exec(value)?.[1] ?? 0) : 0;
}

export function mapOpenLibraryWork(json: unknown): BookSearchResult | null {
	const work = asRecord(json);
	const id = work && workId(work.key);
	if (!work || !id || typeof work.title !== 'string') return null;
	const covers = Array.isArray(work.covers) ? work.covers : [];
	return build(id, work.title, {
		year: yearOf(work.first_publish_date),
		coverUrl: coverUrlOf(covers[0]),
	});
}
