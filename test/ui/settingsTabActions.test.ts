import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { HoardSettingsTab } from '../../src/modules/settings/ui/SettingsTab';
import { DEFAULT_SETTINGS, type HoardTitle } from '../../src/shared/domain/types';
import { until } from '../helpers/common';
import { makeTitle } from '../helpers/setupDataManager';
import { fakeSettings } from '../helpers/fakeSettings';
import { SettingsService } from '../../src/shared/services/SettingsService';
import { emitDataChanged } from '../../src/shared/services/changeSignal';

const shown = (Notice as unknown as { shown: string[] }).shown;

(globalThis as { activeDocument?: Document }).activeDocument = document;

interface Private {
	activeSection: string;
	renderSection(body: HTMLElement): void;
	renderThemePicker(el: HTMLElement, onPicked?: (label: string) => void): void;
	renderTagSection(parent: HTMLElement, label: string, key: 'types' | 'statuses' | 'priorities', onChanged?: () => void): void;
	renderCardSettings(el: HTMLElement, setChip: (label: string) => void): void;
	exportBackupToVault(filename: string, json: string): Promise<void>;
	runRegenerate(wrap: HTMLElement, fill: HTMLElement, text: HTMLElement): Promise<void>;
	rewriteAllFrontmatter(): Promise<void>;
	fetchAllStudios(): Promise<void>;
}

const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));

function settings() {
	return {
		...DEFAULT_SETTINGS,
		types: DEFAULT_SETTINGS.types.map((x) => ({ ...x })),
		statuses: DEFAULT_SETTINGS.statuses.map((x) => ({ ...x })),
		priorities: DEFAULT_SETTINGS.priorities.map((x) => ({ ...x })),
		cardTextStyles: { ...DEFAULT_SETTINGS.cardTextStyles },
	};
}

/** Builds the tab on fake deps; `over` replaces or adds deps (titles, reading, api, ...). */
/** The real service over the fake settings, so a change reaches the main window like in the plugin. */
const emitting = (live: ReturnType<typeof settings>) =>
	new SettingsService({ current: () => live, persist: () => Promise.resolve(), changed: emitDataChanged });

function makeTab(over: Record<string, unknown> = {}, app: unknown = {}) {
	const live = settings();
	const settingsService = fakeSettings(live);
	const state = { importProgress: null as null | { cancel: () => void } };
	const deps: Record<string, unknown> = {
		app,
		settings: settingsService,
		layout: () => ({ root: 'W' }),
		refreshOpenViews: vi.fn(),
		setImportProgress: (progress: typeof state.importProgress) => { state.importProgress = progress; },
		...over,
	};
	const tab = new HoardSettingsTab({} as never, deps as never);
	return { tab, priv: tab as unknown as Private, settings: live, settingsService, state, deps };
}

beforeEach(() => { shown.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('settings section routing', () => {
	const sections = [
		['general', 'renderGeneral'], ['api', 'renderApi'], ['customize', 'renderCustomize'],
		['watchlist', 'renderWatchlist'], ['drafts', 'renderDrafts'], ['custom-lists', 'renderCustomLists'],
		['reading', 'renderReading'], ['widgets', 'renderWidgets'], ['quick-info', 'renderQuickInfo'],
	] as const;

	it.each(sections)('renders the %s section through %s only', (section, method) => {
		const { tab, priv } = makeTab();
		const spies = sections.map(([, m]) =>
			vi.spyOn(tab as unknown as Record<string, () => void>, m).mockImplementation(() => undefined));
		priv.activeSection = section;
		const body = document.createElement('div');
		body.createDiv({ cls: 'stale' });
		priv.renderSection(body);
		expect(body.querySelector('.stale')).toBeNull();
		sections.forEach(([, m], i) => expect(spies[i]!.mock.calls.length).toBe(m === method ? 1 : 0));
	});

	it('renders nothing for an unknown section', () => {
		const { priv } = makeTab();
		priv.activeSection = 'nope';
		const body = document.createElement('div');
		body.createDiv({ cls: 'stale' });
		priv.renderSection(body);
		expect(body.children).toHaveLength(0);
	});
});

describe('theme picker', () => {
	it('marks the current theme and reports its label', () => {
		const { priv, settings } = makeTab();
		settings.colorTheme = 'nightfall';
		const el = document.createElement('div');
		const onPicked = vi.fn();
		priv.renderThemePicker(el, onPicked);
		expect(onPicked).toHaveBeenCalledWith('Nightfall');
		const cards = qa(el, '.hoard-theme-picker__card');
		expect(cards.map((c) => c.classList.contains('is-selected'))).toEqual([false, true, false]);
		expect(qa(cards[0]!, '.hoard-theme-picker__swatch')).toHaveLength(5);
	});

	it('falls back to the default theme when none is stored', () => {
		const { priv, settings } = makeTab();
		(settings as { colorTheme?: string }).colorTheme = undefined;
		const onPicked = vi.fn();
		priv.renderThemePicker(document.createElement('div'), onPicked);
		expect(onPicked).toHaveBeenCalledWith('Default');
	});

	it('saves the clicked theme, moves the selection and refreshes open views', async () => {
		const { priv, settings, deps } = makeTab();
		deps.settings = emitting(settings);
		const changed = vi.fn();
		document.addEventListener('hoard-data-changed', changed);
		const el = document.createElement('div');
		const onPicked = vi.fn();
		priv.renderThemePicker(el, onPicked);
		const cards = qa(el, '.hoard-theme-picker__card');
		cards[2]!.click();
		await until(() => onPicked.mock.calls.length === 2);
		expect(settings.colorTheme).toBe('bluez');
		expect(cards.map((c) => c.classList.contains('is-selected'))).toEqual([false, false, true]);
		expect(onPicked).toHaveBeenLastCalledWith('Bluez');
		expect(deps.refreshOpenViews).toHaveBeenCalledOnce();
		expect(changed).toHaveBeenCalled();
		document.removeEventListener('hoard-data-changed', changed);
	});

	it('refreshes the main window when the click happens in the settings window', async () => {
		const { priv, settings, deps } = makeTab();
		deps.settings = emitting(settings);
		const changed = vi.fn();
		document.addEventListener('hoard-data-changed', changed);
		// Obsidian 1.15: the settings live in their own window, which has the focus during the click
		vi.stubGlobal('activeDocument', document.implementation.createHTMLDocument('settings'));
		try {
			const el = document.createElement('div');
			const onPicked = vi.fn();
			priv.renderThemePicker(el, onPicked);
			qa(el, '.hoard-theme-picker__card')[2]!.click();
			await until(() => onPicked.mock.calls.length === 2);
		} finally {
			vi.stubGlobal('activeDocument', document);
			document.removeEventListener('hoard-data-changed', changed);
		}
		expect(deps.refreshOpenViews).toHaveBeenCalled();
		expect(changed).toHaveBeenCalled();
	});

	it('works without a picked-callback', async () => {
		const { priv, settings } = makeTab({ app: { workspace: { getLeavesOfType: () => [] } } });
		const el = document.createElement('div');
		priv.renderThemePicker(el);
		qa(el, '.hoard-theme-picker__card')[1]!.click();
		await until(() => settings.colorTheme === 'nightfall');
	});
});

describe('tag lists', () => {
	const pills = (el: HTMLElement): string[] =>
		qa(el, '.hoard-tag-editor__pill').map((p) => (q(p, '.hoard-tag-editor__name-input') as HTMLInputElement | null)?.value ?? q(p, '.hoard-tag-editor__name').textContent ?? '');

	it('renders locked built-in types read-only and custom types editable', () => {
		const { priv, settings } = makeTab();
		settings.types = [{ name: 'Movie', color: '#111111' }, { name: 'Docs', color: '#222222' }];
		const el = document.createElement('div');
		const onChanged = vi.fn();
		priv.renderTagSection(el, 'Types', 'types', onChanged);
		const rendered = qa(el, '.hoard-tag-editor__pill');
		expect(rendered).toHaveLength(2);
		expect(q(rendered[0]!, '.hoard-tag-editor__name').textContent).toBe('Movie');
		expect(rendered[0]!.querySelector('.hoard-tag-editor__delete')).toBeNull();
		expect(q(rendered[1]!, '.hoard-tag-editor__name').textContent).toBe('Docs');
		expect(rendered[1]!.querySelector('.hoard-tag-editor__delete')).not.toBeNull();
		expect(onChanged).toHaveBeenCalledTimes(1);
	});

	it('renders statuses as colour-only pills without an add row', () => {
		const { priv } = makeTab();
		const el = document.createElement('div');
		priv.renderTagSection(el, 'Statuses', 'statuses');
		expect(qa(el, '.hoard-tag-editor__pill').length).toBeGreaterThan(0);
		expect(el.querySelector('.hoard-tag-editor__name-input')).toBeNull();
		expect(el.querySelector('.hoard-tag-editor__delete')).toBeNull();
		expect(el.querySelector('.hoard-tag-editor__add-row')).toBeNull();
		expect(el.querySelector('.hoard-settings-group__help-btn')).not.toBeNull();
	});

	it('recolors an entry through the picker and persists it', async () => {
		const { priv, settings, settingsService } = makeTab();
		const el = document.createElement('div');
		priv.renderTagSection(el, 'Priority', 'priorities');
		const pill = qa(el, '.hoard-tag-editor__pill')[0]!;
		const picker = q(pill, '.hoard-tag-editor__color-picker') as HTMLInputElement;
		picker.value = '#123456';
		picker.dispatchEvent(new Event('change'));
		await until(() => settings.priorities[0]!.color === '#123456');
		expect(q(pill, '.hoard-tag-editor__dot').style.getPropertyValue('--hoard-tag-editor-dot-color')).not.toBe('');
		expect(settingsService.update).toHaveBeenCalled();
	});

	it('forwards a click on the dot to the colour picker', () => {
		const { priv } = makeTab();
		const el = document.createElement('div');
		priv.renderTagSection(el, 'Priority', 'priorities');
		const pill = qa(el, '.hoard-tag-editor__pill')[0]!;
		const picker = q(pill, '.hoard-tag-editor__color-picker');
		const click = vi.spyOn(picker, 'click');
		q(pill, '.hoard-tag-editor__dot').click();
		expect(click).toHaveBeenCalled();
	});

	it('adds an entry with the chosen colour and clears the inputs', async () => {
		const { priv, settings } = makeTab();
		const el = document.createElement('div');
		priv.renderTagSection(el, 'Priority', 'priorities');
		const input = q(el, '.hoard-tag-editor__add-row input[type=text]') as HTMLInputElement;
		const color = q(el, '.hoard-tag-editor__add-row .hoard-color-picker__input') as HTMLInputElement;
		input.value = 'Urgent';
		color.value = '#ff0000';
		q(el, '.hoard-tag-editor__add-row button').click();
		await until(() => input.value === '');
		expect(settings.priorities.at(-1)).toEqual({ name: 'Urgent', color: '#ff0000' });
		expect(pills(el)).toContain('Urgent');
	});

	it('ignores an empty name and rejects duplicates and invalid type names', async () => {
		const { priv, settings } = makeTab();
		const el = document.createElement('div');
		priv.renderTagSection(el, 'Types', 'types');
		const input = q(el, '.hoard-tag-editor__add-row input[type=text]') as HTMLInputElement;
		const before = settings.types.length;
		q(el, '.hoard-tag-editor__add-row button').click();
		input.value = 'movie';
		q(el, '.hoard-tag-editor__add-row button').click();
		await until(() => shown.length === 1);
		expect(shown[0]).toContain('movie');
		input.value = 'Bad/Name';
		q(el, '.hoard-tag-editor__add-row button').click();
		await until(() => shown.length === 2);
		expect(settings.types).toHaveLength(before);
	});

	it('removes an entry and announces it', async () => {
		const { priv, settings } = makeTab();
		settings.types = [{ name: 'Docs', color: '#222222' }];
		const el = document.createElement('div');
		priv.renderTagSection(el, 'Types', 'types');
		q(el, '.hoard-tag-editor__delete').click();
		await until(() => shown.length === 1);
		expect(settings.types).toEqual([]);
		expect(el.querySelector('.hoard-tag-editor__pill')).toBeNull();
	});

	describe('rename', () => {
		const setup = (validateName?: (n: string) => string | null) => {
			let list = [{ name: 'Docs', color: '#222222' }, { name: 'Clips', color: '#333333' }];
			const rename = vi.fn((from: string, to: string) => {
				list = list.map((x) => (x.name === from ? { ...x, name: to } : x));
				return Promise.resolve();
			});
			const onChanged = vi.fn();
			const { priv } = makeTab();
			const el = document.createElement('div');
			(priv as unknown as { renderTagListSection(p: HTMLElement, cfg: unknown): void }).renderTagListSection(el, {
				label: 'Genres', getList: () => list, setColor: () => Promise.resolve(), rename, validateName, onChanged,
			});
			const input = q(el, '.hoard-tag-editor__name-input') as HTMLInputElement;
			return { el, input, rename, onChanged };
		};

		it('reverts an empty or unchanged name', () => {
			const { input, rename } = setup();
			input.value = '  ';
			input.dispatchEvent(new Event('change'));
			expect(input.value).toBe('Docs');
			input.value = 'Docs';
			input.dispatchEvent(new Event('blur'));
			expect(input.value).toBe('Docs');
			expect(rename).not.toHaveBeenCalled();
			expect(shown).toHaveLength(0);
		});

		it('reverts a duplicate name with a notice', () => {
			const { input, rename } = setup();
			input.value = 'clips';
			input.dispatchEvent(new Event('change'));
			expect(input.value).toBe('Docs');
			expect(shown).toHaveLength(1);
			expect(rename).not.toHaveBeenCalled();
		});

		it('reverts a name the validator rejects', () => {
			const { input, rename } = setup((n) => (n === 'bad' ? 'not allowed' : null));
			input.value = 'bad';
			input.dispatchEvent(new Event('change'));
			expect(input.value).toBe('Docs');
			expect(shown).toEqual(['not allowed']);
			expect(rename).not.toHaveBeenCalled();
		});

		it('renames once even though change and blur both fire, then re-renders', async () => {
			const { el, input, rename, onChanged } = setup();
			input.value = 'Reels';
			input.dispatchEvent(new Event('change'));
			input.dispatchEvent(new Event('blur'));
			await until(() => onChanged.mock.calls.length === 2);
			expect(rename).toHaveBeenCalledTimes(1);
			expect(rename).toHaveBeenCalledWith('Docs', 'Reels');
			expect((q(el, '.hoard-tag-editor__name-input') as HTMLInputElement).value).toBe('Reels');
		});
	});
});

describe('card settings', () => {
	const setup = () => {
		const notifyChange = vi.fn();
		const applyCardSizeCssVar = vi.fn();
		const ctx = makeTab({ titles: { notifyChange }, applyCardSizeCssVar });
		const el = document.createElement('div');
		const setChip = vi.fn();
		ctx.priv.renderCardSettings(el, setChip);
		return { ...ctx, el, setChip, notifyChange, applyCardSizeCssVar };
	};

	it('shows the unanimous style in the chip and marks the matching tile', () => {
		const { el, setChip } = setup();
		expect(setChip).toHaveBeenLastCalledWith('Text under · 160 px');
		const tiles = qa(el, '.hoard-card-style__option');
		expect(tiles.map((x) => x.classList.contains('is-active'))).toEqual([true, false]);
		expect(qa(el, '.hoard-card-style__tab-row')).toHaveLength(4);
	});

	it('applies a tile style to every tab and persists it', async () => {
		const { el, settings, settingsService, setChip, notifyChange } = setup();
		qa(el, '.hoard-card-style__option')[1]!.click();
		expect(Object.values(settings.cardTextStyles)).toEqual(['inside', 'inside', 'inside', 'inside']);
		expect(setChip).toHaveBeenLastCalledWith('Text inside · 160 px');
		expect(qa(el, '.hoard-card-style__option').map((x) => x.classList.contains('is-active'))).toEqual([false, true]);
		await until(() => notifyChange.mock.calls.length === 1);
		expect(settingsService.update).toHaveBeenCalled();
	});

	it('changes one tab and reports a mixed chip; a repeated click is a no-op', async () => {
		const { el, settings, setChip, notifyChange } = setup();
		const row = qa(el, '.hoard-card-style__tab-row')[1]!;
		const [under, inside] = qa(row, '.hoard-card-style__tab-btn') as [HTMLElement, HTMLElement];
		under.click();
		expect(notifyChange).not.toHaveBeenCalled();
		inside.click();
		expect(settings.cardTextStyles.games).toBe('inside');
		expect(setChip).toHaveBeenLastCalledWith('Mixed · 160 px');
		expect(inside.classList.contains('is-active')).toBe(true);
		expect(qa(el, '.hoard-card-style__option').some((x) => x.classList.contains('is-active'))).toBe(false);
		await until(() => notifyChange.mock.calls.length === 1);
	});

	it('moves a size slider, saves, republishes the CSS var and updates the chip', async () => {
		const { el, settings, settingsService, setChip, applyCardSizeCssVar, notifyChange } = setup();
		const sliders = qa(el, 'input[type=range]') as HTMLInputElement[];
		expect(sliders).toHaveLength(2);
		sliders[0]!.value = '2';
		sliders[0]!.dispatchEvent(new Event('input'));
		await until(() => applyCardSizeCssVar.mock.calls.length === 1);
		expect(settings.cardSize).toBe(2);
		// a drag fires per step: staged (saved once it settles), never one save per step
		expect(settingsService.stage).toHaveBeenCalledTimes(1);
		expect(settingsService.update).not.toHaveBeenCalled();
		expect(notifyChange).toHaveBeenCalled();
		expect(q(el, '.hoard-card-size__value').textContent).toContain('px');
		expect(setChip.mock.calls.length).toBeGreaterThan(1);
		sliders[1]!.value = '-1';
		sliders[1]!.dispatchEvent(new Event('input'));
		await until(() => settings.cardSizeMobile === -1);
	});
});

describe('backup export to the vault', () => {
	const vaultFor = (existing: string[], createFolderFails = false) => {
		const paths = new Set(existing);
		const vault = {
			getFolderByPath: vi.fn((p: string) => (paths.has(p) ? {} : null)),
			createFolder: vi.fn((p: string) => {
				if (createFolderFails) return Promise.reject(new Error('exists'));
				paths.add(p);
				return Promise.resolve({});
			}),
			getAbstractFileByPath: vi.fn((p: string) => (paths.has(p) ? {} : null)),
			create: vi.fn((p: string) => { paths.add(p); return Promise.resolve({}); }),
		};
		const ctx = makeTab({}, { vault });
		return { ...ctx, vault };
	};

	it('creates the folder and writes the file', async () => {
		const { priv, vault } = vaultFor([]);
		await priv.exportBackupToVault('b.json', '{}');
		expect(vault.createFolder).toHaveBeenCalledWith('W/backups');
		expect(vault.create).toHaveBeenCalledWith('W/backups/b.json', '{}');
		expect(shown[0]).toContain('W/backups/b.json');
	});

	it('survives a failing createFolder because the folder may exist already', async () => {
		const { priv, vault } = vaultFor([], true);
		await priv.exportBackupToVault('b.json', '{}');
		expect(vault.create).toHaveBeenCalledWith('W/backups/b.json', '{}');
	});

	it('numbers the file on collisions and keeps extensions', async () => {
		const { priv, vault } = vaultFor(['W/backups', 'W/backups/b.json', 'W/backups/b-2.json']);
		await priv.exportBackupToVault('b.json', '{}');
		expect(vault.createFolder).not.toHaveBeenCalled();
		expect(vault.create).toHaveBeenCalledWith('W/backups/b-3.json', '{}');
	});

	it('handles names without an extension', async () => {
		const { priv, vault } = vaultFor(['W/backups', 'W/backups/plain']);
		await priv.exportBackupToVault('plain', '{}');
		expect(vault.create).toHaveBeenCalledWith('W/backups/plain-2', '{}');
	});
});

describe('regenerate notes', () => {
	const setup = (titles: HoardTitle[], books: unknown[], manga: unknown[], created: boolean[]) => {
		const queue = [...created];
		const next = () => Promise.resolve(queue.shift() ?? false);
		const ctx = makeTab({
			titles: { getTitles: () => titles, createMarkdownFileIfMissing: vi.fn(next) },
			reading: {
				getBooks: () => books, getMangaList: () => manga,
				createReadingNoteIfMissing: vi.fn(next),
			},
		});
		const wrap = document.createElement('div');
		wrap.hide();
		const fill = document.createElement('div');
		const text = document.createElement('div');
		return { ...ctx, wrap, fill, text };
	};

	it('reports nothing to do for an empty library', async () => {
		const { priv, wrap, fill, text } = setup([], [], [], []);
		await priv.runRegenerate(wrap, fill, text);
		expect(wrap.style.display).toBe('');
		expect(text.textContent).toContain('no missing');
	});

	it('creates missing notes for titles, books and manga and summarises', async () => {
		const { priv, deps, wrap, fill, text } = setup(
			[makeTitle({ id: 'a' }), makeTitle({ id: 'b' })], [{ id: 'book' }], [{ id: 'm' }],
			[true, false, true, true],
		);
		await priv.runRegenerate(wrap, fill, text);
		expect(fill.style.getPropertyValue('--hoard-csv-progress-width')).toBe('100%');
		expect(text.textContent).toContain('3');
		expect((deps as unknown as { reading: { createReadingNoteIfMissing: ReturnType<typeof vi.fn> } })
			.reading.createReadingNoteIfMissing).toHaveBeenCalledWith('manga', { id: 'm' });
	});

	it('says nothing was created when every note already exists', async () => {
		const { priv, wrap, fill, text } = setup([makeTitle({ id: 'a' })], [], [], [false]);
		await priv.runRegenerate(wrap, fill, text);
		expect(text.textContent).toContain('no missing');
	});
});

describe('bulk frontmatter rewrite', () => {
	const setup = (titles: HoardTitle[], books: unknown[], manga: unknown[], rewrite: (id: string) => boolean) => {
		const notifyChange = vi.fn();
		const ctx = makeTab({
			titles: {
				getTitles: () => titles, notifyChange,
				rewriteFrontmatterIfExists: vi.fn((tt: HoardTitle) => Promise.resolve(rewrite(tt.id))),
			},
			reading: {
				getBooks: () => books, getMangaList: () => manga,
				rewriteFrontmatterIfExists: vi.fn((_k: string, b: { id: string }) => Promise.resolve(rewrite(b.id))),
			},
		});
		return { ...ctx, notifyChange };
	};

	it('tells the user when there is nothing to rewrite', async () => {
		const { priv } = setup([], [], [], () => true);
		await priv.rewriteAllFrontmatter();
		expect(shown).toHaveLength(1);
	});

	it('rewrites everything and clears the progress state', async () => {
		const { priv, state, notifyChange } = setup([makeTitle({ id: 'a' })], [{ id: 'b' }], [{ id: 'm' }], () => true);
		await priv.rewriteAllFrontmatter();
		expect(shown.at(-1)).toContain('3');
		expect(state.importProgress).toBeNull();
		expect(notifyChange).toHaveBeenCalled();
	});

	it('counts skipped notes separately', async () => {
		const { priv } = setup([makeTitle({ id: 'a' }), makeTitle({ id: 'x' })], [], [], (id) => id !== 'x');
		await priv.rewriteAllFrontmatter();
		const last = shown.at(-1)!;
		expect(last).toContain('1');
		expect(last.toLowerCase()).toContain('skipped');
	});

	it('stops when the progress notice is cancelled', async () => {
		const ctx = setup(
			Array.from({ length: 30 }, (_, i) => makeTitle({ id: `t${i}` })), [], [], () => true,
		);
		const run = ctx.priv.rewriteAllFrontmatter();
		const cancel = ctx.state.importProgress!.cancel;
		cancel();
		await run;
		const rewrite = (ctx.deps as unknown as { titles: { rewriteFrontmatterIfExists: ReturnType<typeof vi.fn> } })
			.titles.rewriteFrontmatterIfExists;
		expect(rewrite.mock.calls.length).toBeLessThan(30);
		expect(shown.at(-1)).toContain('ancel');
	});
});

describe('bulk studio fetch', () => {
	const setup = (titles: HoardTitle[], fetchStudio: (t: HoardTitle) => Promise<unknown>) => {
		const updateStudio = vi.fn(() => Promise.resolve());
		const notifyChange = vi.fn();
		const recordLookup = vi.fn();
		const fetchStudioSpy = vi.fn(fetchStudio);
		const notDue = new Set<string>();
		const ctx = makeTab({
			titles: { getTitles: () => titles, updateStudio, notifyChange, recordLookup, lookupDue: (id: string) => !notDue.has(id) },
			api: { fetchStudio: fetchStudioSpy, hasTmdbKey: () => true },
		});
		return { ...ctx, updateStudio, notifyChange, recordLookup, notDue, fetchStudio: fetchStudioSpy };
	};
	const unfetched = (id: string) => makeTitle({ id });

	it('says so when every title has a studio', async () => {
		const { priv } = setup([makeTitle({ id: 'a', studio: ['X'] })], () => Promise.resolve({ status: 'notfound' }));
		await priv.fetchAllStudios();
		expect(shown).toHaveLength(1);
	});

	it('stores found studios and records every miss without storing it', async () => {
		const { priv, updateStudio, recordLookup, state } = setup(
			[unfetched('hit'), unfetched('miss'), unfetched('fail'), unfetched('offline'), unfetched('nokey')],
			(tt) => {
				if (tt.id === 'hit') return Promise.resolve({ status: 'found', value: { studio: ['Ghibli'], tmdbId: 5, tmdbMediaType: 'movie' } });
				if (tt.id === 'fail') return Promise.reject(new Error('net'));
				if (tt.id === 'offline') return Promise.resolve({ status: 'failed' });
				if (tt.id === 'nokey') return Promise.resolve({ status: 'nokey' });
				return Promise.resolve({ status: 'notfound' });
			},
		);
		await priv.fetchAllStudios();
		expect(updateStudio).toHaveBeenCalledTimes(1);
		expect(updateStudio).toHaveBeenCalledWith('hit', ['Ghibli'], 5, 'movie');
		expect(recordLookup.mock.calls).toEqual([
			['miss', 'studio', { status: 'notfound' }],
			['fail', 'studio', { status: 'failed' }],
			['offline', 'studio', { status: 'failed' }],
			['nokey', 'studio', { status: 'nokey' }],
		]);
		expect(state.importProgress).toBeNull();
		const last = shown.at(-1)!;
		expect(last).toContain('1');
		expect(last).toContain('4');
	});

	it('skips titles whose last lookup is not due and records nothing for them', async () => {
		const ctx = setup([unfetched('later'), unfetched('now')], () => Promise.resolve({ status: 'found', value: { studio: ['A'] } }));
		ctx.notDue.add('later');
		await ctx.priv.fetchAllStudios();
		expect(ctx.fetchStudio).toHaveBeenCalledTimes(1);
		expect(ctx.updateStudio).toHaveBeenCalledWith('now', ['A'], undefined, undefined);
		expect(ctx.recordLookup).not.toHaveBeenCalled();
	});

	it('reports a clean result without misses', async () => {
		const { priv } = setup([unfetched('hit')], () => Promise.resolve({ status: 'found', value: { studio: ['A'] } }));
		await priv.fetchAllStudios();
		expect(shown.at(-1)).toContain('1');
		expect(shown.at(-1)).not.toContain('missed');
	});

	it('stops when cancelled', async () => {
		const ctx = setup([unfetched('a'), unfetched('b'), unfetched('c')], () => Promise.resolve({ status: 'found', value: { studio: ['A'] } }));
		const run = ctx.priv.fetchAllStudios();
		ctx.state.importProgress!.cancel();
		await run;
		expect(ctx.updateStudio).toHaveBeenCalledTimes(1);
		expect(shown.at(-1)).toContain('ancel');
	});
});
