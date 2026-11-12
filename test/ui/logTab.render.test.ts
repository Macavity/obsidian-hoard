import { afterEach, describe, expect, it } from 'vitest';
import { LogTab } from '../../src/LogTab';
import type HoardPlugin from '../../src/main';
import type { HistoryEntry } from '../../src/HistoryManager';
import { qsa } from '../helpers/dom';

afterEach(() => {
	document.body.replaceChildren();
});

const entry = (id: string, source: HistoryEntry['source'], ts: string): HistoryEntry =>
	({ id, timestamp: ts, message: `"X${id}" added`, source });

function mount(entries: HistoryEntry[]): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const plugin = {
		historyManager: { getEntries: () => entries, onChange: () => {}, offChange: () => {} },
	} as unknown as HoardPlugin;
	new LogTab(container, plugin).render();
	return container;
}

const buttons = (c: HTMLElement): HTMLButtonElement[] => qsa<HTMLButtonElement>(c, '.hoard-log__filter-btn');

describe('LogTab render', () => {
	it('shows the empty state for no entries', () => {
		const c = mount([]);
		expect(c.querySelector('.hoard-log__empty')?.textContent).toBe('No events yet. Actions from Watchlist, Reading and Games will appear here.');
		expect(c.querySelector('.hoard-log__timeline')).toBeNull();
	});

	it('builds a virtual timeline sized by day headers and entries', () => {
		const c = mount([
			entry('1', 'Watchlist', '2026-11-06T10:00:00'),
			entry('2', 'Watchlist', '2026-11-06T11:00:00'),
			entry('3', 'Games', '2026-11-05T11:00:00'),
		]);
		expect(c.querySelector('.hoard-log__empty')).toBeNull();
		const spacer = c.querySelector<HTMLElement>('.hoard-log__spacer')!;
		// two day headers (40) + three rows (32)
		expect(spacer.style.getPropertyValue('--hoard-log-spacer-height')).toBe(`${2 * 40 + 3 * 32}px`);
	});

	it('colours the dot and the action word through variables', () => {
		const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
		Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
		try {
			const c = mount([entry('1', 'Watchlist', '2026-11-06T10:00:00')]);
			expect(c.querySelector<HTMLElement>('.hoard-log__dot')!.style.getPropertyValue('--hoard-log-dot-color')).not.toBe('');
			expect(c.querySelector<HTMLElement>('.hoard-log__action')!.style.getPropertyValue('--hoard-log-action-color')).not.toBe('');
		} finally {
			if (height) Object.defineProperty(HTMLElement.prototype, 'clientHeight', height);
			else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
		}
	});

	it('filters by source and reports an empty source', () => {
		const c = mount([entry('1', 'Watchlist', '2026-11-06T10:00:00')]);
		expect(buttons(c).map((b) => b.textContent)).toHaveLength(4);
		const active = () => buttons(c).filter((b) => b.classList.contains('is-active')).map((b) => b.textContent);
		expect(active()).toHaveLength(1);
		buttons(c)[3]!.click();
		expect(c.querySelector('.hoard-log__empty')?.textContent).toContain(buttons(c)[3]!.textContent);
		expect(c.querySelector('.hoard-log__timeline')).toBeNull();
		expect(active()).toEqual([buttons(c)[3]!.textContent]);
		// clicking the active filter again is a no-op
		buttons(c)[3]!.click();
		expect(c.querySelector('.hoard-log__empty')).not.toBeNull();
		buttons(c)[1]!.click();
		expect(c.querySelector('.hoard-log__timeline')).not.toBeNull();
	});
});
