import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddWizardModal } from '../src/modules/add/ui/AddWizardModal';
import { apiErrorMessage } from '../src/shared/api/ApiService';
import { t } from '../src/shared/i18n';
import type {
	AddDone, AddFormContext, AddHit, AddKind, AddProvider, AddWizardOptions,
} from '../src/modules/add/domain/provider';

const flush = async (): Promise<void> => {
	for (let i = 0; i < 6; i++) await Promise.resolve();
};

const hit = (kind: AddKind, title: string): AddHit => ({
	kind, id: `${kind}-${title}`, title, meta: 'meta', fallbackIcon: 'x', inLibrary: null,
});

interface Pending { kind: AddKind; query: string; resolve(h: AddHit[]): void; reject(e: unknown): void }

function fakeProvider(kinds: AddKind[], extra: Partial<AddProvider> = {}) {
	const pending: Pending[] = [];
	const forms: Array<{ ctx: AddFormContext; destroyed: boolean }> = [];
	const search = vi.fn((kind: AddKind, query: string) => new Promise<AddHit[]>((resolve, reject) => {
		pending.push({ kind, query, resolve, reject });
	}));
	const provider: AddProvider = {
		kinds,
		search,
		renderForm: (host, ctx) => {
			host.createDiv({ cls: 'fake-form', text: ctx.hit?.title ?? 'manual' });
			const rec = { ctx, destroyed: false };
			forms.push(rec);
			return { destroy: () => { rec.destroyed = true; } };
		},
		...extra,
	};
	const answer = (kind: AddKind, query: string, hits: AddHit[]): void => {
		pending.find((p) => p.kind === kind && p.query === query)?.resolve(hits);
	};
	return { provider, search, pending, forms, answer };
}

function open(providers: AddProvider[], opts: AddWizardOptions = {}, colorTheme?: string) {
	const modal = new AddWizardModal({} as never, providers, opts, colorTheme);
	modal.open();
	const root = modal.contentEl;
	const input = root.querySelector('input')!;
	const section = (key: string): HTMLElement | null => root.querySelector(`[data-section="${key}"]`);
	const titles = (key: string): string[] =>
		Array.from(section(key)?.querySelectorAll('.hoard-search-picker__result-title') ?? []).map((e) => e.textContent ?? '');
	const type = (text: string): void => {
		input.value = text;
		input.dispatchEvent(new Event('input'));
	};
	const enter = (text: string): void => {
		input.value = text;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
	};
	const status = (): HTMLElement => root.querySelector<HTMLElement>('.hoard-add-wizard__status')!;
	const manual = (): HTMLButtonElement[] => Array.from(root.querySelectorAll('.hoard-add-wizard__manual button'));
	return { modal, root, input, section, titles, type, enter, manual, status };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('AddWizardModal', () => {
	it('searches every kind of every provider once per query', async () => {
		const a = fakeProvider(['anime', 'movie']);
		const b = fakeProvider(['game']);
		const w = open([a.provider, b.provider]);
		w.type('dune');
		expect(a.search).not.toHaveBeenCalled();
		vi.advanceTimersByTime(600);
		expect(a.search).toHaveBeenCalledTimes(2);
		expect(a.search).toHaveBeenCalledWith('anime', 'dune');
		expect(a.search).toHaveBeenCalledWith('movie', 'dune');
		expect(b.search).toHaveBeenCalledExactlyOnceWith('game', 'dune');
		a.answer('anime', 'dune', [hit('anime', 'Dune A')]);
		await flush();
		expect(w.titles('anime')).toStrictEqual(['Dune A']);
	});

	it('Enter searches at once', () => {
		const a = fakeProvider(['anime']);
		const w = open([a.provider]);
		w.enter('naruto');
		expect(a.search).toHaveBeenCalledExactlyOnceWith('anime', 'naruto');
	});

	it('searches the initial query at once', () => {
		const a = fakeProvider(['anime']);
		const w = open([a.provider], { query: 'bleach' });
		expect(a.search).toHaveBeenCalledExactlyOnceWith('anime', 'bleach');
		expect(w.input.value).toBe('bleach');
	});

	it('a failing kind shows its error only', async () => {
		const a = fakeProvider(['anime', 'movie']);
		const w = open([a.provider]);
		w.enter('q');
		a.pending.find((p) => p.kind === 'anime')?.reject(new Error('boom'));
		a.answer('movie', 'q', [hit('movie', 'Film')]);
		await flush();
		expect(w.section('anime')?.querySelector('.hoard-search-picker__api-error')).not.toBeNull();
		expect(w.section('movie')?.querySelector('.hoard-search-picker__api-error')).toBeNull();
		expect(w.titles('movie')).toStrictEqual(['Film']);
	});

	it('stale query results are dropped', async () => {
		const a = fakeProvider(['anime']);
		const w = open([a.provider]);
		w.enter('one');
		w.enter('two');
		a.answer('anime', 'two', [hit('anime', 'Two')]);
		await flush();
		a.answer('anime', 'one', [hit('anime', 'One')]);
		await flush();
		expect(w.titles('anime')).toStrictEqual(['Two']);
	});

	it('back restores results without searching', async () => {
		const a = fakeProvider(['anime']);
		const w = open([a.provider]);
		w.enter('q');
		a.answer('anime', 'q', [hit('anime', 'Hit')]);
		await flush();
		w.root.querySelector<HTMLElement>('.hoard-search-picker__result-card')!.click();
		expect(a.forms).toHaveLength(1);
		expect(a.forms[0]?.ctx.hit?.title).toBe('Hit');
		expect(a.forms[0]?.ctx.query).toBe('q');
		w.root.querySelector<HTMLElement>('.hoard-add-wizard__back')!.click();
		expect(a.forms[0]?.destroyed).toBe(true);
		expect(w.root.querySelector('.fake-form')).toBeNull();
		expect(w.titles('anime')).toStrictEqual(['Hit']);
		expect(a.search).toHaveBeenCalledTimes(1);
	});

	it('closing with pending searches renders nothing', async () => {
		const a = fakeProvider(['anime']);
		const w = open([a.provider]);
		w.enter('q');
		w.modal.close();
		a.answer('anime', 'q', [hit('anime', 'Late')]);
		await flush();
		expect(w.root.querySelector('.hoard-search-picker__result-card')).toBeNull();
	});

	it('manual row lists allowed kinds and opens the form with hit null and the query', () => {
		const a = fakeProvider(['game', 'anime']);
		const w = open([a.provider], { preferredKinds: ['game'] });
		w.enter('abc');
		expect(w.manual().map((b) => b.textContent)).toStrictEqual(['Add manually as Game', 'Add manually as Anime']);
		w.manual()[0]?.click();
		expect(a.forms[0]?.ctx).toMatchObject({ kind: 'game', hit: null, query: 'abc', target: 'library' });
	});

	it('target maybe offers only maybeKinds', () => {
		const a = fakeProvider(['anime', 'movie'], { maybeKinds: ['movie'] });
		const b = fakeProvider(['game']);
		const w = open([a.provider, b.provider], { target: 'maybe' });
		w.enter('q');
		expect(a.search).toHaveBeenCalledExactlyOnceWith('movie', 'q');
		expect(b.search).not.toHaveBeenCalled();
		expect(w.manual()).toHaveLength(1);
		w.manual()[0]?.click();
		expect(a.forms[0]?.ctx.target).toBe('maybe');
	});

	it('a URL resolved by a provider skips to step 2', async () => {
		const resolved = hit('movie', 'From URL');
		const a = fakeProvider(['movie'], { resolveUrl: vi.fn(() => Promise.resolve(resolved)) });
		const w = open([a.provider]);
		w.enter('https://example.test/x');
		await flush();
		expect(a.search).not.toHaveBeenCalled();
		expect(a.forms[0]?.ctx).toMatchObject({ kind: 'movie', hit: resolved });
	});

	it('searches normally when no provider claims the text', async () => {
		const a = fakeProvider(['movie'], { resolveUrl: vi.fn(() => Promise.resolve(null)) });
		const w = open([a.provider]);
		w.enter('matrix');
		await flush();
		expect(a.search).toHaveBeenCalledExactlyOnceWith('movie', 'matrix');
	});

	it('done closes the wizard and reports the new entry', () => {
		const a = fakeProvider(['movie']);
		const onAdded = vi.fn<(d: AddDone) => void>();
		const w = open([a.provider], { onAdded });
		w.enter('q');
		w.manual()[0]?.click();
		a.forms[0]?.ctx.done({ kind: 'movie', id: 'n1' });
		expect(onAdded).toHaveBeenCalledExactlyOnceWith({ kind: 'movie', id: 'n1' });
		expect(a.forms[0]?.destroyed).toBe(true);
		expect(document.body.contains(w.modal.containerEl)).toBe(false);
	});

	it('a manual form uses the typed text and cancels the pending search', () => {
		const a = fakeProvider(['game']);
		const w = open([a.provider]);
		w.type('  halo ');
		w.manual()[0]?.click();
		vi.advanceTimersByTime(1000);
		expect(a.search).not.toHaveBeenCalled();
		expect(a.forms[0]?.ctx.query).toBe('halo');
	});

	it('a synchronous throw in search fails only that kind', async () => {
		const a = fakeProvider(['anime', 'movie']);
		a.search.mockImplementation((kind: AddKind) => {
			if (kind === 'anime') throw new Error('sync');
			return Promise.resolve([hit('movie', 'Film')]);
		});
		const w = open([a.provider]);
		w.enter('q');
		await flush();
		expect(w.section('anime')?.querySelector('.hoard-search-picker__api-error')).not.toBeNull();
		expect(w.titles('movie')).toStrictEqual(['Film']);
	});

	it('ignores URL hits of kinds the target does not allow and skips resolvers without allowed kinds', async () => {
		const outside = vi.fn(() => Promise.resolve(hit('game', 'G')));
		const a = fakeProvider(['game'], { resolveUrl: outside });
		const wrongKind = fakeProvider(['movie'], { maybeKinds: ['movie'], resolveUrl: vi.fn(() => Promise.resolve(hit('anime', 'A'))) });
		const w = open([a.provider, wrongKind.provider], { target: 'maybe' });
		w.enter('https://x.test');
		await flush();
		expect(outside).not.toHaveBeenCalled();
		expect(wrongKind.forms).toHaveLength(0);
		expect(wrongKind.search).toHaveBeenCalledExactlyOnceWith('movie', 'https://x.test');
	});

	it('a link the provider owns but cannot resolve shows its message and is never searched', async () => {
		const a = fakeProvider(['movie'], { resolveUrl: vi.fn(() => Promise.resolve({ message: 'no such title' })) });
		const w = open([a.provider]);
		w.enter('https://www.imdb.com/title/tt9/');
		await flush();
		expect(a.search).not.toHaveBeenCalled();
		expect(a.forms).toHaveLength(0);
		expect(w.status().textContent).toBe('no such title');
		expect(w.status().classList.contains('is-hidden')).toBe(false);
		expect(w.root.querySelector('.hoard-modal__loading')).toBeNull();
	});

	it('a failing link lookup shows the error, not a not-found message, and is never searched', async () => {
		const a = fakeProvider(['movie'], { resolveUrl: vi.fn(() => Promise.reject(new Error('boom'))) });
		const w = open([a.provider]);
		w.enter('https://www.imdb.com/title/tt9/');
		await flush();
		expect(a.search).not.toHaveBeenCalled();
		expect(w.status().textContent).toBe(apiErrorMessage(new Error('boom')));
		expect(w.status().textContent).not.toBe(t('add.url.notFound'));
	});

	it('a link answer clears with the next query', async () => {
		const a = fakeProvider(['movie'], { resolveUrl: vi.fn((text: string) => Promise.resolve(text.startsWith('http') ? { message: 'x' } : null)) });
		const w = open([a.provider]);
		w.enter('https://a.test');
		await flush();
		w.enter('matrix');
		await flush();
		expect(w.status().classList.contains('is-hidden')).toBe(true);
	});

	it('a lookup that resolves after a manual form was opened leaves the form and sections alone', async () => {
		let resolve!: (h: AddHit) => void;
		const a = fakeProvider(['movie'], { resolveUrl: vi.fn(() => new Promise<AddHit>((r) => { resolve = r; })) });
		const w = open([a.provider]);
		w.enter('https://x.test/m');
		w.manual()[0]?.click();
		expect(a.forms).toHaveLength(1);
		resolve(hit('movie', 'Late'));
		await flush();
		expect(a.forms).toHaveLength(1);
		expect(a.search).not.toHaveBeenCalled();
		w.root.querySelector<HTMLElement>('.hoard-add-wizard__back')!.click();
		expect(w.root.querySelector('.hoard-modal__loading')).toBeNull();
	});

	it('shows no matches when every section comes back empty, and not when one has hits or failed', async () => {
		const a = fakeProvider(['anime', 'movie']);
		const w = open([a.provider]);
		w.enter('zzz');
		a.answer('anime', 'zzz', []);
		await flush();
		expect(w.status().classList.contains('is-hidden')).toBe(true);
		a.answer('movie', 'zzz', []);
		await flush();
		expect(w.status().textContent).toBe(t('add.noMatches'));
		w.enter('abc');
		a.answer('anime', 'abc', [hit('anime', 'A')]);
		a.answer('movie', 'abc', []);
		await flush();
		expect(w.status().classList.contains('is-hidden')).toBe(true);
		w.enter('err');
		a.pending.find((p) => p.kind === 'anime' && p.query === 'err')?.reject(new Error('x'));
		a.answer('movie', 'err', []);
		await flush();
		expect(w.status().classList.contains('is-hidden')).toBe(true);
	});

	it('titles the maybe target as a Maybe add', () => {
		const a = fakeProvider(['movie'], { maybeKinds: ['movie'] });
		const w = open([a.provider], { target: 'maybe' });
		expect(w.modal.titleEl.textContent).toBe(t('add.wizard.titleMaybe'));
		expect(open([a.provider]).modal.titleEl.textContent).toBe(t('add.wizard.title'));
	});

	it('scopes the plugin theme to the dialog', () => {
		const a = fakeProvider(['movie']);
		const w = open([a.provider], {}, 'nightfall');
		expect(w.root.classList.contains('hoard-view')).toBe(true);
		expect(w.root.getAttribute('data-theme')).toBe('nightfall');
		expect(w.modal.modalEl.getAttribute('data-theme')).toBe('nightfall');
	});
});
