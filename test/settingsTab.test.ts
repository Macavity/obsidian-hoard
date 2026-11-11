import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice as RealNotice } from 'obsidian';

/** the mock records every string notice */
const Notice = RealNotice as unknown as { shown: string[] };
const gamesKeyChip = (s: Record<string, string>) => realChip(s as never);
import { HoardSettingsTab } from '../src/SettingsTab';
import { gamesKeyChip as realChip } from '../src/ui/gamesKeyChip';
import type { HoardTitle, TagDefinition } from '../src/types';

/** The private members under test, reached through a cast. */
interface Internals {
	exportBackupToVault(filename: string, json: string): Promise<void>;
	rewriteAllFrontmatter(): Promise<void>;
	fetchAllStudios(): Promise<void>;
	runRegenerate(wrap: HTMLElement, fill: HTMLElement, text: HTMLElement): Promise<void>;
	gamesFilterRefs(kind: 'type' | 'platform'): string[][];
	renderThemePicker(el: HTMLElement, onPicked?: (label: string) => void): void;
	renderTagSection(parent: HTMLElement, label: string, key: 'types' | 'statuses' | 'priorities', onChanged?: () => void): void;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const until = async (done: () => boolean) => { for (let i = 0; i < 100 && !done(); i++) await flush(); };

function makeTab(over: { titles?: Partial<HoardTitle>[]; books?: unknown[]; manga?: unknown[]; files?: string[]; root?: string } = {}) {
	const files = new Set(over.files ?? []);
	const written: Record<string, string> = {};
	const adapter = { write: vi.fn(() => Promise.resolve()) };
	const vault = {
		adapter,
		getFolderByPath: vi.fn((p: string) => (files.has(p) ? { path: p } : null)),
		createFolder: vi.fn((p: string) => (p === 'boom/backups' ? Promise.reject(new Error('exists')) : Promise.resolve(void files.add(p)))),
		getAbstractFileByPath: vi.fn((p: string) => (files.has(p) ? { path: p } : null)),
		create: vi.fn((p: string, d: string) => { written[p] = d; files.add(p); return Promise.resolve({ path: p }); }),
	};
	const titles = (over.titles ?? []) as HoardTitle[];
	const dm = {
		getTitles: () => titles,
		notifyChange: vi.fn(),
		rewriteFrontmatterIfExists: vi.fn((t: HoardTitle) => Promise.resolve(t.title !== 'gone')),
		createMarkdownFileIfMissing: vi.fn((t: HoardTitle) => Promise.resolve(t.title === 'new')),
		updateStudio: vi.fn(() => Promise.resolve()),
	};
	const reading = {
		getBooks: () => over.books ?? [],
		getMangaList: () => over.manga ?? [],
		rewriteFrontmatterIfExists: vi.fn(() => Promise.resolve(true)),
		createReadingNoteIfMissing: vi.fn(() => Promise.resolve(false)),
	};
	const settings = {
		colorTheme: 'default',
		animeApiSource: 'jikan',
		typeApiMapping: {},
		gamesFilters: { genreExclude: ['RPG'], platformExclude: [] as string[] },
		types: [{ name: 'Movie', color: '#111111' }, { name: 'Docu', color: '#222222' }] as TagDefinition[],
		statuses: [{ name: 'Watching', color: '#333333' }] as TagDefinition[],
		priorities: [] as TagDefinition[],
	};
	const plugin = {
		settings,
		saveSettings: vi.fn(() => Promise.resolve()),
		getLayout: () => ({ root: over.root ?? 'Hoard' }),
		dataManager: dm,
		readingDataManager: reading,
		gameDataManager: { getSettings: () => ({ savedFilterPreset: { genreExclude: ['RPG', 'FPS'] } }) },
		apiService: {
			fetchStudio: vi.fn((t: HoardTitle) => {
				if (t.title === 'err') return Promise.reject(new Error('net'));
				return Promise.resolve(t.title === 'hit' ? { studio: ['Ghibli'], tmdbId: 1, tmdbMediaType: 'movie' } : null);
			}),
		},
		importProgress: null as unknown,
		app: { workspace: { getLeavesOfType: () => [{ view: {} }] } },
	};
	const app = { vault };
	const tab = new HoardSettingsTab(app as never, plugin as never);
	return { tab: tab as unknown as Internals, plugin, dm, reading, app, adapter, written, settings };
}

beforeEach(() => { Notice.shown.length = 0; vi.stubGlobal('activeDocument', document); });
afterEach(() => vi.unstubAllGlobals());

describe('gamesKeyChip', () => {
	it('reports the active provider and whether its key is set', () => {
		expect(gamesKeyChip({})).toEqual({ text: 'RAWG · key needed', tone: 'warn' });
		expect(gamesKeyChip({ rawgApiKey: 'k' })).toEqual({ text: 'RAWG · key set', tone: 'ok' });
		expect(gamesKeyChip({ gamesApiSource: 'igdb', igdbClientId: 'id' })).toEqual({ text: 'IGDB · key needed', tone: 'warn' });
		expect(gamesKeyChip({ gamesApiSource: 'igdb', igdbClientId: 'id', igdbClientSecret: 's' })).toEqual({ text: 'IGDB · key set', tone: 'ok' });
	});
});

describe('HoardSettingsTab tag colour pickers', () => {
	it('names each picker after its tag', () => {
		const { tab } = makeTab();
		const el = document.createElement('div');
		tab.renderTagSection(el, 'Types', 'types');
		const labels = Array.from(el.querySelectorAll<HTMLInputElement>('input.hoard-tag-color-picker'), (i) => i.getAttribute('aria-label'));
		expect(labels).toEqual(['Color for Movie', 'Color for Docu']);
	});
});

describe('HoardSettingsTab tag sections', () => {
	it('locks built-in types and statuses; colour changes persist', async () => {
		const { tab, settings, plugin } = makeTab();
		const el = document.createElement('div');
		tab.renderTagSection(el, 'Statuses', 'statuses');
		expect(el.querySelector('.hoard-tag-del')).toBeNull();
		expect(el.querySelector('.hoard-tag-name')!.textContent).toBe('Watching');
		const picker = el.querySelector<HTMLInputElement>('.hoard-tag-color-picker')!;
		picker.value = '#abcdef';
		picker.dispatchEvent(new Event('change'));
		await until(() => plugin.saveSettings.mock.calls.length > 0);
		expect(settings.statuses[0]!.color).toBe('#abcdef');
		const types = document.createElement('div');
		tab.renderTagSection(types, 'Types', 'types');
		expect(types.querySelectorAll('.hoard-tag-del')).toHaveLength(1);
	});

	it('adds, rejects duplicates and bad names, removes', async () => {
		const onChanged = vi.fn();
		const { tab, settings } = makeTab();
		const el = document.createElement('div');
		tab.renderTagSection(el, 'Types', 'types', onChanged);
		const name = el.querySelector<HTMLInputElement>('.hoard-tag-add-row .hoard-modal-input')!;
		const add = el.querySelector<HTMLButtonElement>('.hoard-tag-add-row button')!;
		add.click();
		name.value = 'docu';
		add.click();
		await until(() => Notice.shown.length > 0);
		expect(Notice.shown).toContain('"docu" already exists.');
		name.value = 'a/b';
		add.click();
		await until(() => Notice.shown.length > 1);
		name.value = 'Anime Film';
		add.click();
		await until(() => name.value === '');
		expect(settings.types).toHaveLength(3);
		expect(name.value).toBe('');
		el.querySelector<HTMLElement>('.hoard-tag-del')!.click();
		await until(() => Notice.shown.includes('Removed "Docu".'));
		expect(settings.types.map((t) => t.name)).toEqual(['Movie', 'Anime Film']);
		expect(onChanged).toHaveBeenCalled();
		const dot = el.querySelector<HTMLElement>('.hoard-tag-dot')!;
		const click = vi.spyOn(el.querySelector<HTMLInputElement>('.hoard-tag-color-picker')!, 'click');
		dot.click();
		expect(click).toHaveBeenCalled();
	});
});

describe('HoardSettingsTab rename commit', () => {
	it('reverts empty, unchanged, duplicate and invalid names; renames once', async () => {
		const { tab } = makeTab();
		const list: TagDefinition[] = [{ name: 'PC', color: '#000000' }, { name: 'Switch', color: '#111111' }];
		const rename = vi.fn((from: string, to: string) => { list.find((t) => t.name === from)!.name = to; return Promise.resolve(); });
		const el = document.createElement('div');
		(tab as unknown as { renderTagListSection(p: HTMLElement, c: unknown): void }).renderTagListSection(el, {
			label: 'Platforms', getList: () => list, setColor: () => Promise.resolve(), rename,
			validateName: (n: string) => (n.includes('/') ? 'bad name' : null),
		});
		const input = () => el.querySelector<HTMLInputElement>('.hoard-tag-name-input')!;
		const commit = (v: string) => { input().value = v; input().dispatchEvent(new Event('change')); };
		commit('  ');
		expect(input().value).toBe('PC');
		commit('PC');
		commit('switch');
		expect(Notice.shown).toContain('"switch" already exists.');
		expect(input().value).toBe('PC');
		commit('a/b');
		expect(Notice.shown).toContain('bad name');
		commit('Steam Deck');
		input().dispatchEvent(new Event('blur'));
		await until(() => rename.mock.calls.length > 0);
		expect(rename).toHaveBeenCalledOnce();
		expect(rename).toHaveBeenCalledWith('PC', 'Steam Deck');
	});
});

describe('HoardSettingsTab games filter refs', () => {
	it('collects live and preset exclusion lists per axis', () => {
		const { tab } = makeTab();
		expect(tab.gamesFilterRefs('type')).toEqual([['RPG'], ['RPG', 'FPS']]);
		expect(tab.gamesFilterRefs('platform')).toEqual([[]]);
	});
});

describe('HoardSettingsTab theme picker', () => {
	it('marks the current theme and switches on click', async () => {
		const { tab, settings, plugin } = makeTab();
		const picked = vi.fn();
		const el = document.createElement('div');
		tab.renderThemePicker(el, picked);
		expect(picked).toHaveBeenCalledWith('Default');
		const cards = el.querySelectorAll<HTMLElement>('.hoard-theme-card');
		expect(cards[0]!.classList.contains('is-selected')).toBe(true);
		cards[1]!.click();
		await until(() => picked.mock.calls.length > 1);
		expect(settings.colorTheme).toBe('nightfall');
		expect(cards[1]!.classList.contains('is-selected')).toBe(true);
		expect(cards[0]!.classList.contains('is-selected')).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe('HoardSettingsTab exportBackupToVault', () => {
	it('creates the folder and writes the file', async () => {
		const { tab, written } = makeTab();
		await tab.exportBackupToVault('b.json', '{}');
		expect(written).toEqual({ 'Hoard/backups/b.json': '{}' });
	});
	it('numbers the name on collision and tolerates a racing mkdir', async () => {
		const { tab, written } = makeTab({ root: 'boom', files: ['boom/backups/b.json', 'boom/backups/b-2.json'] });
		await tab.exportBackupToVault('b.json', '{}');
		expect(Object.keys(written)).toEqual(['boom/backups/b-3.json']);
	});
	it('writes through the vault API, not the adapter', async () => {
		const { tab, app } = makeTab();
		const adapterWrite = vi.spyOn(app.vault.adapter, 'write');
		await tab.exportBackupToVault('b.json', '{}');
		expect(adapterWrite).not.toHaveBeenCalled();
		expect(app.vault.getAbstractFileByPath('Hoard/backups/b.json')).not.toBeNull();
	});
	it('handles names without an extension', async () => {
		const { tab, written } = makeTab({ files: ['Hoard/backups', 'Hoard/backups/b'] });
		await tab.exportBackupToVault('b', '{}');
		expect(Object.keys(written)).toEqual(['Hoard/backups/b-2']);
	});
});

describe('HoardSettingsTab rewriteAllFrontmatter', () => {
	it('says so when there is nothing to rewrite', async () => {
		await makeTab().tab.rewriteAllFrontmatter();
		expect(Notice.shown).toContain('No notes to rewrite.');
	});
	it('rewrites every note, counts skipped ones and clears progress', async () => {
		const titles = Array.from({ length: 11 }, (_, i) => ({ id: `t${i}`, title: i === 0 ? 'gone' : `T${i}` }));
		const { tab, plugin, reading } = makeTab({ titles, books: [{}], manga: [{}] });
		await tab.rewriteAllFrontmatter();
		expect(reading.rewriteFrontmatterIfExists).toHaveBeenCalledTimes(2);
		expect(plugin.importProgress).toBeNull();
		expect(Notice.shown).toContain('Done: 12 notes rewritten, 1 skipped (no file).');
	});
	it('stops when cancelled', async () => {
		const { tab, dm } = makeTab({ titles: [{ title: 'a' }, { title: 'b' }] });
		dm.rewriteFrontmatterIfExists.mockImplementationOnce(() => {
			(tab as unknown as { plugin: { importProgress: { cancel(): void } } }).plugin.importProgress.cancel();
			return Promise.resolve(true);
		});
		await tab.rewriteAllFrontmatter();
		expect(Notice.shown).toContain('Cancelled: 1 note rewritten.');
	});
});

describe('HoardSettingsTab fetchAllStudios', () => {
	const anime = (title: string) => ({ id: title, title, type: 'Anime' });
	it('says so when every title has a studio', async () => {
		await makeTab().tab.fetchAllStudios();
		expect(Notice.shown).toContain('Every title already has a studio.');
	});
	it('fills hits, stores misses as none and survives errors', async () => {
		const { tab, dm, plugin } = makeTab({ titles: [anime('hit'), anime('miss'), anime('err')] });
		await tab.fetchAllStudios();
		expect(dm.updateStudio).toHaveBeenCalledTimes(2);
		expect(plugin.importProgress).toBeNull();
		expect(Notice.shown).toContain('Done: 1 title filled, 2 with no studio available.');
	});
	it('stops when cancelled', async () => {
		const { tab, plugin } = makeTab({ titles: [anime('hit'), anime('hit2')] });
		plugin.apiService.fetchStudio.mockImplementationOnce(() => {
			(plugin.importProgress as { cancel(): void }).cancel();
			return Promise.resolve({ studio: ['A'], tmdbId: 1, tmdbMediaType: 'tv' });
		});
		await tab.fetchAllStudios();
		expect(Notice.shown).toContain('Cancelled: 1 title filled.');
	});
});

describe('HoardSettingsTab runRegenerate', () => {
	const els = () => {
		const wrap = document.createElement('div') as HTMLElement & { show(): void };
		wrap.show = vi.fn();
		return [wrap, document.createElement('div'), document.createElement('div')] as const;
	};
	it('reports nothing missing for an empty library', async () => {
		const [w, f, t] = els();
		await makeTab().tab.runRegenerate(w, f, t);
		expect(t.textContent).toBe('Done: no missing files found');
	});
	it('counts created and existing notes across the library', async () => {
		const [w, f, t] = els();
		await makeTab({ titles: [{ title: 'new' }, { title: 'old' }], books: [{}], manga: [{}] }).tab.runRegenerate(w, f, t);
		expect(t.textContent).toBe('Done: 1 file created, 3 already existed');
		expect(f.style.width).toBe('100%');
	});
	it('reports nothing missing when every note exists', async () => {
		const [w, f, t] = els();
		await makeTab({ titles: [{ title: 'old' }] }).tab.runRegenerate(w, f, t);
		expect(t.textContent).toBe('Done: no missing files found');
	});
});
