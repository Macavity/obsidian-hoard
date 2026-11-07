import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSearchPicker, type SearchPickerConfig } from '../../src/ui/SearchPicker';
import { El } from '../helpers/fakeEl';

const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

function setup(over: Partial<SearchPickerConfig<string>> = {}) {
	const search = vi.fn((q: string) => Promise.resolve([`${q}-1`, `${q}-2`, `${q}-3`]));
	const onSelect = vi.fn();
	const picker = createSearchPicker<string>({
		placeholder: 'Search...',
		search,
		noApiMessage: () => null,
		renderResult: (host, result, select) => {
			const item = (host as unknown as El).createDiv({ cls: 'hoard-result-item', text: result });
			item.addEventListener('click', () => select(item as unknown as HTMLElement));
			return item as unknown as HTMLElement;
		},
		onSelect,
		pageSize: 2,
		withYear: true,
		...over,
	});
	const root = new El();
	picker.mount(root as unknown as HTMLElement);
	const results = root.find('hoard-modal-results')!;
	const pager = root.find('hoard-result-pager');
	const type = (q: string): void => {
		const input = root.find('hoard-search-query')!;
		input.value = q;
		input.fire('input');
	};
	return { picker, root, results, pager, search, onSelect, type };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('SearchPicker', () => {
	it('mounts the stacked search row with year, results and pager', () => {
		const { root, pager } = setup();
		const row = root.find('hoard-search-row')!;
		expect(row.find('hoard-search-fields')!.find('hoard-search-year')).toBeDefined();
		expect(pager).toBeDefined();
	});

	it('mounts the plain row without year and pager', () => {
		const { root, pager } = setup({ withYear: false, pageSize: undefined, grid: true });
		expect(root.find('hoard-search-row')).toBeUndefined();
		expect(root.find('hoard-search-year')).toBeUndefined();
		expect(pager).toBeUndefined();
		expect(root.find('hoard-results-grid')).toBeDefined();
	});

	it('debounces typing by 600ms and searches', async () => {
		const { type, search, results } = setup();
		type('a');
		type('ab');
		vi.advanceTimersByTime(599);
		expect(search).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		await flush();
		expect(search).toHaveBeenCalledTimes(1);
		expect(search).toHaveBeenCalledWith('ab', '');
		expect(results.findAll('hoard-result-item')).toHaveLength(2);
	});

	it('honors debounceMs and destroy cancels the pending search', () => {
		const { type, search, picker } = setup({ debounceMs: 100 });
		type('a');
		picker.destroy();
		vi.advanceTimersByTime(1000);
		expect(search).not.toHaveBeenCalled();
	});

	it('strips non-digits from the year and passes it on', async () => {
		const { root, type, search } = setup();
		const year = root.find('hoard-search-year')!;
		year.value = '19x9';
		year.fire('input');
		expect(year.value).toBe('199');
		type('q');
		vi.advanceTimersByTime(600);
		await flush();
		expect(search).toHaveBeenCalledWith('q', '199');
	});

	it('ignores empty queries', async () => {
		const { picker, search } = setup();
		await picker.search();
		expect(search).not.toHaveBeenCalled();
	});

	it('shows the loading state while searching', async () => {
		let resolve: (v: string[]) => void = () => {};
		const { picker, results, type } = setup({ search: () => new Promise((r) => { resolve = r; }) });
		type('q');
		const run = picker.search();
		expect(results.find('hoard-modal-loading')).toBeDefined();
		resolve(['x']);
		await run;
		expect(results.find('hoard-modal-loading')).toBeUndefined();
		expect(results.findAll('hoard-result-item')).toHaveLength(1);
	});

	it('pages through results', async () => {
		const { picker, results, pager, type } = setup();
		type('q');
		await picker.search();
		const info = (): string => pager!.find('hoard-result-pager-info')!.text;
		expect(info()).toBe('Page 1 of 2');
		const [prev, next] = pager!.findAll('hoard-result-pager-btn');
		expect(prev!.disabled).toBe(true);
		next!.fire('click');
		expect(info()).toBe('Page 2 of 2');
		expect(results.findAll('hoard-result-item').map((e) => [e.text, e.dataset['idx']])).toEqual([['q-3', '2']]);
		expect(results.scrolled).toBe(true);
		expect(pager!.findAll('hoard-result-pager-btn')[1]!.disabled).toBe(true);
	});

	it('renders everything without a pageSize', async () => {
		const { picker, results, type } = setup({ pageSize: undefined });
		type('q');
		await picker.search();
		expect(results.findAll('hoard-result-item')).toHaveLength(3);
	});

	it('drops stale responses', async () => {
		const pending: Array<(v: string[]) => void> = [];
		const { picker, results, type } = setup({ search: () => new Promise((r) => { pending.push(r); }) });
		type('a');
		const first = picker.search();
		type('b');
		const second = picker.search();
		pending[1]!(['fresh']);
		await second;
		pending[0]!(['stale']);
		await first;
		expect(results.findAll('hoard-result-item').map((e) => e.text)).toEqual(['fresh']);
	});

	it('renders the no-API message and skips the search', async () => {
		const { picker, results, search, type } = setup({ noApiMessage: () => 'No key' });
		type('q');
		await picker.search();
		expect(search).not.toHaveBeenCalled();
		const msg = results.find('hoard-modal-no-api')!;
		expect(msg.find('hoard-modal-no-api-icon')!.text).toBe('ℹ');
		expect(msg.find('hoard-modal-no-api-text')!.text).toBe('No key');
		expect(msg.has('hoard-modal-api-error')).toBe(false);
	});

	it('renders API errors in the panel', async () => {
		const { picker, results, type } = setup({ search: () => Promise.reject(new Error('boom')) });
		type('q');
		await picker.search();
		const msg = results.find('hoard-modal-no-api')!;
		expect(msg.has('hoard-modal-api-error')).toBe(true);
		expect(msg.find('hoard-modal-no-api-icon')!.text).toBe('⚠');
		expect(results.findAll('hoard-result-item')).toHaveLength(0);
	});

	it('reset clears results and messages', async () => {
		const { picker, results, type } = setup({ search: () => Promise.reject(new Error('boom')) });
		type('q');
		await picker.search();
		picker.reset();
		expect(results.children).toHaveLength(0);
	});

	it('reset supersedes an in-flight search', async () => {
		const pending: Array<(v: string[]) => void> = [];
		const { picker, results, type } = setup({ search: () => new Promise((r) => { pending.push(r); }) });
		type('a');
		const inflight = picker.search();
		picker.reset();
		expect(results.find('hoard-modal-loading')).toBeUndefined();
		pending[0]!(['stale']);
		await inflight;
		expect(results.findAll('hoard-result-item')).toHaveLength(0);
	});

	it('highlights the selection and invalidates it on the next search', async () => {
		const { picker, results, onSelect, type } = setup();
		type('q');
		await picker.search();
		const [a, b] = results.findAll('hoard-result-item');
		a!.fire('click');
		b!.fire('click');
		expect(a!.has('is-selected')).toBe(false);
		expect(b!.has('is-selected')).toBe(true);
		const [first, second] = onSelect.mock.calls as Array<[string, () => boolean]>;
		expect(first![0]).toBe('q-1');
		expect(first![1]()).toBe(false); // superseded by the second selection
		expect(second![1]()).toBe(true);
		await picker.search();
		expect(second![1]()).toBe(false); // a new search supersedes the selection
	});

	it('seeds the query input from initialQuery', () => {
		const { root } = setup({ initialQuery: 'seed' });
		expect(root.find('hoard-search-query')!.value).toBe('seed');
	});
});
