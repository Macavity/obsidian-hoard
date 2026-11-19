import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from 'obsidian';
import { searchHelpWith } from '../../src/design-system/SearchHelpModal';

afterEach(() => { vi.restoreAllMocks(); });

function open(fields: Array<{ name: string; text?: boolean; number?: boolean }>): HTMLElement {
	const spy = vi.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
	searchHelpWith({} as never)('Tab', fields as never);
	const modal = spy.mock.contexts[0] as Modal & { onOpen: () => unknown };
	void modal.onOpen();
	return modal.contentEl;
}

describe('SearchHelpModal', () => {
	it('lists text and number fields', () => {
		const el = open([{ name: 'title', text: true }, { name: 'year', number: true }]);
		expect(el.querySelectorAll('.hoard-search-help__row')).toHaveLength(7);
		expect(el.querySelector('.hoard-search-help__chips')!.textContent).toBe('title');
		expect(el.textContent).toContain('year:');
	});

	it('shows a dash without text fields and omits number ranges', () => {
		const el = open([]);
		expect(el.querySelector('.hoard-search-help__chips')!.textContent).toBe('\u2014');
		expect(el.querySelectorAll('.hoard-search-help__chips')).toHaveLength(1);
	});
});
