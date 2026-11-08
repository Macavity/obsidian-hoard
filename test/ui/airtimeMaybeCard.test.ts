import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from '../__mocks__/obsidian';
import { t } from '../../src/i18n';
import type { MaybeTitle } from '../../src/types';
import { isoOffset, makeTab, newWorld } from './airtimeTab.harness';

const confirms = vi.hoisted<{ message: string; onConfirm: () => void }[]>(() => []);
vi.mock('../../src/ConfirmModal', () => ({
	ConfirmModal: class {
		constructor(_app: unknown, message: string, onConfirm: () => void) { confirms.push({ message, onConfirm }); }
		open(): void {}
	},
}));

const open = vi.fn();
beforeEach(() => {
	confirms.length = 0;
	(Notice as unknown as { shown: string[] }).shown.length = 0;
	open.mockClear();
	vi.stubGlobal('activeWindow', { open });
});
afterEach(() => { vi.unstubAllGlobals(); });

const maybe = (over: Partial<MaybeTitle> = {}): MaybeTitle =>
	({ id: 'm1', title: 'Dune 3', type: 'Movie', externalLink: 'https://example.test/dune', releaseDate: isoOffset(10), dateAdded: '2026-01-01', ...over }) as unknown as MaybeTitle;

function render(mt: MaybeTitle) {
	const env = makeTab(newWorld());
	const parent = document.createElement('div');
	(env.tab as unknown as { renderMaybeCard: (p: HTMLElement, m: MaybeTitle, d: Date) => void }).renderMaybeCard(parent, mt, new Date());
	return { ...env, parent, pill: () => parent.querySelector<HTMLElement>('.hoard-airtime-pill')! };
}

describe('AirtimeTab.renderMaybeCard', () => {
	it('shows title and a days pill for a future release', () => {
		const { parent, pill } = render(maybe());
		expect(parent.querySelector('.hoard-maybe-card-title')!.textContent).toBe('Dune 3');
		expect(pill().className).toContain('hoard-airtime-pill-days');
		expect(parent.querySelector('.is-due')).toBeNull();
	});

	it('uses the tomorrow pill one day before release', () => {
		expect(render(maybe({ releaseDate: isoOffset(1) })).pill().className).toContain('hoard-airtime-pill-tomorrow');
	});

	it('marks a past release as due', () => {
		const { parent, pill } = render(maybe({ releaseDate: isoOffset(-3) }));
		expect(parent.querySelector('.hoard-maybe-card')!.className).toContain('is-due');
		expect(pill().className).toContain('hoard-airtime-pill-due');
	});

	it('shows a dash without release date', () => {
		expect(render(maybe({ releaseDate: null })).pill().textContent).toBe('—');
	});

	it('opens the external link or warns when none is set', () => {
		render(maybe()).parent.querySelector<HTMLElement>('.hoard-airtime-action-btn')!.click();
		expect(open).toHaveBeenCalledWith('https://example.test/dune', '_blank');
		render(maybe({ externalLink: '' })).parent.querySelector<HTMLElement>('.hoard-airtime-action-btn')!.click();
		expect((Notice as unknown as { shown: string[] }).shown).toEqual([t('airtime.notices.noLink')]);
	});

	it('removes the maybe title after confirming', async () => {
		const env = render(maybe());
		const removeMaybeTitle = vi.fn(() => Promise.resolve());
		(env.dm as unknown as Record<string, unknown>).removeMaybeTitle = removeMaybeTitle;
		env.parent.querySelector<HTMLElement>('.hoard-btn-danger')!.click();
		expect(confirms[0]!.message).toBe(t('airtime.confirm.removeMaybe', { title: 'Dune 3' }));
		confirms[0]!.onConfirm();
		await Promise.resolve();
		expect(removeMaybeTitle).toHaveBeenCalledWith('m1');
	});
});
