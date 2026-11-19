import { afterEach, describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { VaultLayout } from '../../src/shared/storage/VaultLayout';
import { LocalStore } from '../../src/shared/storage/LocalStore';
import { setupDataManager } from '../helpers/setupDataManager';
import { titleFromProperties } from '../../src/shared/storage/titleCodec';
import { decodeBook, decodeManga } from '../../src/shared/storage/readingCodec';
import { decodeGame } from '../../src/shared/storage/gameCodec';
import { getDisplayTrailer } from '../../src/modules/watchlist/domain/titleHelpers';
import { getDisplayPoster, getTitleCredits } from '../../src/modules/watchlist/domain/titles';
import type { HoardTitle } from '../../src/modules/watchlist/domain/model';
import type { Decoded, EntryCache } from '../../src/shared/storage/storageTypes';

/**
 * Readability check, not a snapshot: notes written by earlier versions keep decoding, and the values a card
 * shows survive. It asserts on meaning (no throw, no unexpected invalid fields, what is displayed), never on
 * object shape or key order, so a codec may change its representation freely.
 */

const HERE = fileURLToPath(import.meta.url);
const VAULT = resolve(HERE, '../../../hoard-test-vault');
const ROOT = 'Hoard';
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
/** Fixture notes that are broken on purpose and may report invalid fields. None today. */
const MEANT_BROKEN = new Set<string>();

const walk = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		if (e.name.startsWith('.')) return [];
		const full = join(dir, e.name);
		return e.isDirectory() ? walk(full) : [full];
	});

function properties(src: string): Record<string, unknown> | null {
	const m = FRONTMATTER.exec(src);
	if (!m) return null;
	try {
		const v: unknown = parse(m[1] ?? '');
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

const base = parse(readFileSync(join(VAULT, ROOT, 'Hoard.base'), 'utf8')) as { hoard?: { types?: { name: string }[] } };
const layout = new VaultLayout(ROOT, () => (base.hoard?.types ?? []).map((t) => t.name));

interface Note { path: string; kind: 'title' | 'book' | 'manga' | 'game'; id: string; props: Record<string, unknown> }
const notes: Note[] = walk(VAULT)
	.map((f) => relative(VAULT, f).split(sep).join('/'))
	.filter((p) => p.endsWith('.md'))
	.sort()
	.flatMap((path) => {
		const c = layout.classify(path);
		const props = c && properties(readFileSync(join(VAULT, path), 'utf8'));
		return c && props && Object.keys(props).length > 0 ? [{ path, kind: c.kind, id: c.id, props }] : [];
	});

type CardEntry = { title: string; status?: string; rating?: number };
const decodeNote = (n: Note): Decoded<CardEntry> => {
	if (n.kind === 'title') return titleFromProperties(n.id, n.props, undefined);
	if (n.kind === 'book') return decodeBook(n.id, n.props, []);
	if (n.kind === 'manga') return decodeManga(n.id, n.props, []);
	return decodeGame(n.id, n.props);
};

/** What a title card and detail view put in front of the user. */
const displayed = (t: HoardTitle) => ({
	poster: getDisplayPoster(t),
	trailer: getDisplayTrailer(t),
	director: getTitleCredits(t, 'director'),
	cast: getTitleCredits(t, 'cast'),
	studio: getTitleCredits(t, 'studio'),
});

const decodeTitle = (props: Record<string, unknown>, cache?: EntryCache) =>
	titleFromProperties('Movie/X', { Name: 'X', Type: 'Movie', Status: 'Completed', ...props }, cache);

describe('hoard-test-vault notes stay readable', () => {
	it('finds the Hoard notes of every kind', () => {
		expect(notes.length).toBeGreaterThan(10);
		expect(new Set(notes.map((n) => n.kind))).toEqual(new Set(['title', 'book', 'manga', 'game']));
	});

	it.each(notes.map((n) => [n.path, n] as const))('%s decodes with the card fields', (_path, n) => {
		const d = decodeNote(n);
		if (!MEANT_BROKEN.has(n.path)) expect(d.invalidFields).toEqual([]);
		expect(d.entry.title).toBeTruthy();
		expect(d.entry.status).toBeTruthy();
		expect(typeof d.entry.rating).toBe('number');
		if (n.kind !== 'title') return;
		const t = d.entry as HoardTitle;
		expect(t.type).toBeTruthy();
		expect(Array.isArray(t.watchedEpisodes)).toBe(true); // what progress is computed from
		const cover = n.props['Cover'];
		if (typeof cover === 'string' && cover) expect(getDisplayPoster(t)).toBe(cover);
	});
});

describe('WatchLog-era property sets', () => {
	it('keeps the readable rest when values have the wrong type', () => {
		const t = decodeTitle({ Rating: 'x', Cast: 5, Seasons: {}, Cover: 'https://img.example/p.jpg', Runtime: 100 });
		expect(t.entry.title).toBe('X');
		expect(t.entry.status).toBe('Completed');
		expect(t.entry.episodeDuration).toBe(100);
		expect(getDisplayPoster(t.entry)).toBe('https://img.example/p.jpg');
		expect(t.invalidFields).toEqual(expect.arrayContaining(['Rating', 'Cast', 'Seasons']));
		expect(t.invalidFields).not.toContain('Cover');
		expect(t.invalidFields).not.toContain('Runtime');
		expect(() => displayed(t.entry)).not.toThrow();
	});
});

describe('data.json with schema-2 markers', () => {
	const load = async (): Promise<LocalStore> => {
		const raw: unknown = JSON.parse(readFileSync(resolve(HERE, '../../fixtures/data-v2-markers.json'), 'utf8'));
		const store = new LocalStore({ loadData: () => Promise.resolve(raw), saveData: () => Promise.resolve() });
		expect(await store.load()).toEqual({ schema: 2 });
		return store;
	};
	const cover = 'https://img.example/note-cover.jpg';

	it('displays an entry with only markers like one without cache', async () => {
		const store = await load();
		const withMarkers = decodeTitle({ Cover: cover }, store.getCache('Movie/Markers Only'));
		const without = decodeTitle({ Cover: cover }, undefined);
		expect(withMarkers.invalidFields).toEqual([]);
		expect(displayed(withMarkers.entry)).toEqual(displayed(without.entry));
		expect(displayed(withMarkers.entry)).toEqual({ poster: cover, trailer: '', director: [], cast: [], studio: [] });
	});

	it('displays the real trailer and names next to the markers', async () => {
		const store = await load();
		const t = decodeTitle({ Cover: cover }, store.getCache('Movie/Real Values'));
		expect(t.invalidFields).toEqual([]);
		expect(displayed(t.entry)).toEqual({
			poster: cover,
			trailer: 'https://www.youtube.com/watch?v=abc123',
			director: ['Denis Villeneuve'],
			cast: ['Amy Adams', 'Jeremy Renner'],
			studio: ['Lava Bear Films'],
		});
	});

	it('lets the note win over the cache', async () => {
		const store = await load();
		const t = decodeTitle({ Trailer: 'https://youtu.be/mine', Director: ['Me'] }, store.getCache('Movie/Real Values'));
		expect(displayed(t.entry)).toMatchObject({ trailer: 'https://youtu.be/mine', director: ['Me'] });
	});
});

describe('data.json from before the lookup state', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('shows no poster for a cached poster marker and looks again after a week', async () => {
    const start = new Date('2026-11-16T12:00:00Z');
    vi.useFakeTimers({ now: start, toFake: ['Date'] });
    const { dm, f, local, index } = await setupDataManager({ 'W/Movie/X.md': '---\nName: X\nType: Movie\n---\n' });
    f.plugin.data = { schemaVersion: 2, settings: {}, ui: {}, cache: { 'Movie/X': { posterUrl: 'none' } } };
    await local.load();
    await index.rebuild();

    const t = dm.getTitle('Movie/X')!;
    expect(getDisplayPoster(t)).toBe('');
    expect(local.getCache('Movie/X')).toEqual({ apiCheck: { poster: { at: start.toISOString(), result: 'notfound' } } });
    vi.setSystemTime(new Date(start.getTime() + 6 * 86_400_000));
    expect(dm.lookupDue('Movie/X', 'poster')).toBe(false);
    vi.setSystemTime(new Date(start.getTime() + 8 * 86_400_000));
    expect(dm.lookupDue('Movie/X', 'poster')).toBe(true);
  });

  it('shows the note cover for a cached marker and never looks for a poster', async () => {
    const { dm, f, local, index } = await setupDataManager({ 'W/Movie/X.md': '---\nName: X\nType: Movie\nCover: https://img.example/c.jpg\n---\n' });
    f.plugin.data = { schemaVersion: 2, settings: {}, ui: {}, cache: { 'Movie/X': { posterUrl: 'none', trailerUrl: 'none', director: ['none'] } } };
    await local.load();
    await index.rebuild();
    expect(getDisplayPoster(dm.getTitle('Movie/X')!)).toBe('https://img.example/c.jpg');
    expect(dm.lookupDue('Movie/X', 'poster')).toBe(false);
  });
});
