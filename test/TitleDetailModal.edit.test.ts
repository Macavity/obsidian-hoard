import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { TitleDetailModal, renderCreditsRefreshButton } from '../src/TitleDetailModal';
import { DEFAULT_SETTINGS, type HoardTitle } from '../src/types';
import { t } from '../src/i18n';

vi.mock('../src/NoteLinkButton', () => ({
	appendNoteLinkButton: (_app: unknown, parent: HTMLElement) => parent.createSpan({ cls: 'note-link-stub' }),
}));
vi.mock('../src/CommunityRating', () => ({
	renderCommunityRating: vi.fn(),
	maybeAutoRefreshCommunityRating: vi.fn(),
}));

const mkTitle = (over: Partial<HoardTitle> = {}): HoardTitle => (({
	id: 't1', title: 'Alien', type: 'Movie', status: 'Plan to Watch', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 1, episodeDuration: 100,
	releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [],
	director: ['none'], cast: ['none'], studio: ['none'],
	...over,
}));

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function buildPlugin(stored: HoardTitle | null, over: Record<string, unknown> = {}) {
	const dataManager = {
		getCollapsedSeasonsForTitle: () => new Set<number>(),
		getTitle: vi.fn(() => stored),
		getNoteFilePath: () => 'Hoard/Alien.md',
		calcTimeRemainingForModal: () => 90,
		calcTimeWatched: () => 10,
		getEffectiveTotal: () => 1,
		getProgress: () => 40,
		updateTitle: vi.fn(() => Promise.resolve()),
		updateCredits: vi.fn(() => Promise.resolve()),
		...over,
	};
	const apiService = {
		fetchCredits: vi.fn(() => Promise.resolve(null as { director: string[]; cast: string[] } | null)),
		fetchStudio: vi.fn(() => Promise.resolve(null)),
		hasTmdbKey: vi.fn(() => true),
		hasOmdbKey: vi.fn(() => false),
	};
	const plugin = {
		settings: { ...DEFAULT_SETTINGS, seasonPalette: ['#111', '#222'] },
		dataManager,
		apiService,
		posterService: undefined,
	};
	return { plugin, dataManager, apiService };
}

describe('TitleDetailModal title editing', () => {
	function open(title: HoardTitle, stored: HoardTitle | null = title) {
		const built = buildPlugin(stored);
		const modal = new TitleDetailModal({} as never, built.plugin as never, title) as unknown as {
			headerEl: HTMLElement | null;
			contentEl: HTMLElement;
			mobile: boolean;
			changed: boolean;
			renderHeaderBody: () => void;
		};
		modal.mobile = false;
		modal.headerEl = document.createElement('div');
		modal.contentEl.appendChild(modal.headerEl);
		modal.renderHeaderBody();
		document.body.appendChild(modal.contentEl);
		const header = modal.headerEl;
		const edit = () => {
			(header.querySelector('.hoard-detail__title') as HTMLElement).click();
			return header.querySelector('input.hoard-detail__title-input') as HTMLInputElement;
		};
		return { ...built, modal, header, edit };
	}

	afterEach(() => {
		document.body.empty();
		(Platform as { isMobile: boolean }).isMobile = false;
		vi.clearAllMocks();
	});

	it('swaps the heading for an input prefilled with the title', () => {
		const { header, edit } = open(mkTitle());
		const input = edit();
		expect(input.value).toBe('Alien');
		expect(header.querySelector('.hoard-detail__title')).toBeNull();
	});

	it('saves a trimmed new title on blur, marks the modal changed and rebuilds the header', async () => {
		const stored = mkTitle();
		const { header, edit, dataManager, modal } = open(stored);
		const input = edit();
		input.value = '  Aliens  ';
		input.blur();
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).toHaveBeenCalledTimes(1);
		expect(dataManager.updateTitle).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', title: 'Aliens' }));
		expect(modal.changed).toBe(true);
		expect(header.querySelector('input.hoard-detail__title-input')).toBeNull();
		expect(header.querySelector('.hoard-detail__title')!.textContent).toBe('Aliens');
	});

	it('commits only once when blur fires repeatedly', async () => {
		const { edit, dataManager } = open(mkTitle());
		const input = edit();
		input.value = 'Aliens';
		input.dispatchEvent(new Event('blur'));
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).toHaveBeenCalledTimes(1);
	});

	it('commits through Enter by blurring the input', async () => {
		const { edit, dataManager } = open(mkTitle());
		const input = edit();
		input.value = 'Prometheus';
		const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
		input.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).toHaveBeenCalledWith(expect.objectContaining({ title: 'Prometheus' }));
	});

	it('restores the heading without saving when the value is unchanged', async () => {
		const { header, edit, dataManager, modal } = open(mkTitle());
		const input = edit();
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).not.toHaveBeenCalled();
		expect(modal.changed).toBeFalsy();
		expect(header.querySelector('.hoard-detail__title')!.textContent).toBe('Alien');
	});

	it('restores the heading without saving when the value is blank', async () => {
		const { header, edit, dataManager } = open(mkTitle());
		const input = edit();
		input.value = '   ';
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).not.toHaveBeenCalled();
		expect(header.querySelector('.hoard-detail__title')!.textContent).toBe('Alien');
	});

	it('restores the heading without saving when the stored title vanished', async () => {
		const { header, edit, dataManager } = open(mkTitle(), null);
		const input = edit();
		input.value = 'Aliens';
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).not.toHaveBeenCalled();
		expect(header.querySelector('.hoard-detail__title')!.textContent).toBe('Alien');
	});

	it('discards the edit on Escape, even if a blur follows', async () => {
		const { header, edit, dataManager } = open(mkTitle());
		const input = edit();
		input.value = 'Aliens';
		const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		input.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(dataManager.updateTitle).not.toHaveBeenCalled();
		expect(header.querySelector('.hoard-detail__title')!.textContent).toBe('Alien');
	});
});

describe('renderCreditsRefreshButton', () => {
	let parent: HTMLElement;
	beforeEach(() => {
		parent = document.createElement('div');
		document.body.appendChild(parent);
	});
	afterEach(() => {
		document.body.empty();
		vi.clearAllMocks();
	});

	const render = (id: string, stored: HoardTitle | null, fetched: { director: string[]; cast: string[] } | null, onDone = vi.fn()) => {
		const title = mkTitle({ id });
		const { plugin, dataManager, apiService } = buildPlugin(stored);
		apiService.fetchCredits.mockResolvedValue(fetched);
		renderCreditsRefreshButton(parent, plugin as never, title, onDone);
		const btn = parent.querySelector('button.hoard-credits__refresh') as HTMLButtonElement;
		return { btn, title, dataManager, apiService, onDone };
	};

	it('renders a labelled framed refresh button', () => {
		const { btn } = render('r0', null, null);
		expect(btn.getAttribute('data-icon')).toBe('refresh-cw');
		expect(btn.getAttribute('aria-label')).toBe(t('detail.credits.refresh'));
		expect(btn.classList.contains('is-loading')).toBe(false);
	});

	it('stores fetched credits, spins while in flight and reports a change', async () => {
		const stored = mkTitle({ id: 'r1' });
		const { btn, dataManager, apiService, onDone } = render('r1', stored, { director: ['Ridley Scott'], cast: ['Sigourney Weaver'] });
		btn.click();
		expect(btn.classList.contains('is-loading')).toBe(true);
		await flush();
		expect(apiService.fetchCredits).toHaveBeenCalledWith(stored, expect.anything());
		expect(dataManager.updateCredits).toHaveBeenCalledWith('r1', ['Ridley Scott'], ['Sigourney Weaver']);
		expect(btn.classList.contains('is-loading')).toBe(false);
		expect(onDone).toHaveBeenCalledWith(true);
	});

	it('falls back to the passed title and writes the none sentinel when nothing was fetched', async () => {
		const { btn, title, dataManager, apiService, onDone } = render('r2', null, null);
		btn.click();
		await flush();
		expect(apiService.fetchCredits).toHaveBeenCalledWith(title, expect.anything());
		expect(dataManager.updateCredits).toHaveBeenCalledWith('r2', ['none'], ['none']);
		expect(onDone).toHaveBeenCalledWith(true);
	});

	it('reports no change when persistence fails and clears the spinner', async () => {
		const { btn, dataManager, onDone } = render('r3', null, { director: ['x'], cast: ['y'] });
		dataManager.updateCredits.mockRejectedValueOnce(new Error('disk'));
		btn.click();
		await flush();
		expect(btn.classList.contains('is-loading')).toBe(false);
		expect(onDone).toHaveBeenCalledWith(false);
	});

	it('ignores clicks while a refresh for the same title is in flight', async () => {
		const { btn, apiService, onDone } = render('r4', null, null);
		btn.click();
		btn.click();
		await flush();
		expect(apiService.fetchCredits).toHaveBeenCalledTimes(1);
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	it('shows the spinner on a button rendered mid-flight', async () => {
		const first = render('r5', null, null);
		first.btn.click();
		const second = document.createElement('div');
		const { plugin } = buildPlugin(null);
		renderCreditsRefreshButton(second, plugin as never, mkTitle({ id: 'r5' }), vi.fn());
		expect(second.querySelector('.hoard-credits__refresh')!.classList.contains('is-loading')).toBe(true);
		await flush();
	});
});
