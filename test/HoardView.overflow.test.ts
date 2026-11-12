import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoardView } from '../src/HoardView';

type Guarded = { tabContentEl: HTMLElement; guardOverflow(): void };

describe('HoardView.guardOverflow', () => {
	afterEach(() => vi.restoreAllMocks());

	it('adds the overflow class when the tab content computes to hidden, without touching inline styles', async () => {
		const el = document.createElement('div');
		const view = Object.assign(Object.create(HoardView.prototype) as Guarded, { tabContentEl: el });
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflow: 'hidden' } as CSSStyleDeclaration);
		view.guardOverflow();
		el.addClass('trigger');
		await new Promise((r) => setTimeout(r, 0));
		expect(el.classList.contains(('hoard-force-overflow-auto'))).toBe(true);
		expect(el.getAttribute('style')).toBeNull();
	});

	it('leaves the class off when overflow is already scrollable', async () => {
		const el = document.createElement('div');
		const view = Object.assign(Object.create(HoardView.prototype) as Guarded, { tabContentEl: el });
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflow: 'hidden auto' } as CSSStyleDeclaration);
		view.guardOverflow();
		el.addClass('trigger');
		await new Promise((r) => setTimeout(r, 0));
		expect(el.classList.contains(('hoard-force-overflow-auto'))).toBe(false);
	});
});
