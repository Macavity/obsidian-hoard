import { describe, it, expect } from 'vitest';
import { createIconButton } from '../../src/ui/IconButton';

describe('createIconButton', () => {
	const parent = () => document.createElement('div');

	it('builds a labelled icon-only button', () => {
		const p = parent();
		const btn = createIconButton(p, { icon: 'refresh-cw', label: 'Refresh' });
		expect(btn.parentElement).toBe(p);
		expect(btn.tagName).toBe('BUTTON');
		expect(btn.getAttribute('type')).toBe('button');
		expect(btn.classList.contains('hoard-icon-btn')).toBe(true);
		expect(btn.getAttribute('aria-label')).toBe('Refresh');
		expect(btn.getAttribute('data-tooltip')).toBe('Refresh');
		expect(btn.getAttribute('data-icon')).toBe('refresh-cw');
		expect(btn.hasAttribute('title')).toBe(false);
	});

	it('adds variant and context classes', () => {
		const btn = createIconButton(parent(), { icon: 'x', label: 'Remove', variant: 'sm', cls: 'hoard-a hoard-b' });
		expect(Array.from(btn.classList)).toEqual(expect.arrayContaining(['hoard-icon-btn', 'hoard-icon-btn--sm', 'hoard-a', 'hoard-b']));
	});

	it('maps framed to its class', () => {
		const btn = createIconButton(parent(), { icon: 'x', label: 'x', variant: 'framed' });
		expect(btn.classList.contains('hoard-icon-btn--framed')).toBe(true);
	});
});
