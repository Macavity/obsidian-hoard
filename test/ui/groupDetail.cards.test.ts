import { describe, expect, it, vi } from 'vitest';
import { GroupDetailModal } from '../../src/modules/watchlist/ui/TitleDetailModal';
import { makeTitle } from '../helpers/setupDataManager';
import { fakeSettings } from '../helpers/fakeSettings';
import type { HoardTitle } from '../../src/modules/watchlist/domain/model';

const settings = fakeSettings({
	colorTheme: 'default',
	types: [{ name: 'Movie', color: '#ff0000' }],
	statuses: [{ name: 'Watching', color: '#00ff00' }, { name: 'Completed', color: '#0000ff' }],
});

function open(members: HoardTitle[], posters = { enqueue: vi.fn(() => Promise.resolve('http://img/x.jpg')) }) {
	const openTitleDetail = vi.fn((_o: { onChanged?: () => void }) => undefined);
	const openEditTitle = vi.fn((_o: { onSaved: () => void }) => undefined);
	const modal = new GroupDetailModal(
		{} as never, settings as never, { getEffectiveTotal: () => 0 }, posters,
		openTitleDetail, openEditTitle, { group: { name: 'G' } as never, members },
	);
	(modal as unknown as { renderAll: () => void }).renderAll();
	return { modal, openTitleDetail, openEditTitle, posters };
}

describe('group detail member cards', () => {
	it('renders poster, badges, year and progress', () => {
		const { modal } = open([makeTitle({
			id: 'a', title: 'Alpha', type: 'Movie', status: 'Watching', posterUrl: 'https://x/p.jpg',
			releaseDate: '2020-05-01', totalEpisodes: 4, watchedEpisodes: [1, 2],
		})]);
		const card = modal.contentEl.querySelector('.hoard-card')!;
		expect(card.classList.contains('has-poster')).toBe(true);
		expect(card.querySelector('.hoard-card__year')!.textContent).toBe('2020');
		expect(card.querySelector('.hoard-card__status-badge')).not.toBeNull();
		expect(card.querySelector('.hoard-card__progress-bar')).not.toBeNull();
		const img = card.querySelector('img') as HTMLImageElement;
		img.onerror!(new Event('error'));
		expect(card.classList.contains('has-poster')).toBe(false);
	});

	it('shows full progress when completed', () => {
		const { modal } = open([makeTitle({ id: 'a', status: 'Completed', posterUrl: 'https://x/p.jpg', totalEpisodes: 4 })]);
		expect(modal.contentEl.querySelector('.hoard-card__progress-fill')).not.toBeNull();
	});

	it('fetches a missing poster and shows it', async () => {
		const { modal, posters } = open([makeTitle({ id: 'a', type: 'Unknown', status: 'Nope', posterUrl: '' })]);
		const card = modal.contentEl.querySelector('.hoard-card')!;
		expect(posters.enqueue).toHaveBeenCalled();
		await vi.waitFor(() => expect(card.classList.contains('has-poster')).toBe(true));
		expect(card.querySelector('.hoard-card__status-badge')).toBeNull();
		expect(card.querySelector('.hoard-card__year')).toBeNull();
		expect(card.querySelector('.hoard-card__progress-bar')).toBeNull();
	});

	it('keeps the placeholder when the poster fetch finds nothing', async () => {
		const posters = { enqueue: vi.fn(() => Promise.resolve(null)) };
		const { modal } = open([makeTitle({ id: 'a', posterUrl: '' })], posters as never);
		await vi.waitFor(() => expect(posters.enqueue).toHaveBeenCalled());
		await Promise.resolve();
		expect(modal.contentEl.querySelector('.hoard-card')!.classList.contains('has-poster')).toBe(false);
	});

	it('opens detail on card click and edit on menu click', () => {
		const { modal, openTitleDetail, openEditTitle } = open([makeTitle({ id: 'a', posterUrl: 'https://x/p.jpg' })]);
		modal.close = vi.fn();
		(modal.contentEl.querySelector('.hoard-card__menu-btn') as HTMLElement).click();
		expect(openEditTitle).toHaveBeenCalledTimes(1);
		expect(openTitleDetail).not.toHaveBeenCalled();
		(modal.contentEl.querySelector('.hoard-card') as HTMLElement).click();
		expect(openTitleDetail).toHaveBeenCalledTimes(1);
		openEditTitle.mock.calls[0]![0].onSaved();
		openTitleDetail.mock.calls[0]![0].onChanged?.();
	});
});
