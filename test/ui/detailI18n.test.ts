import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import de from '../../src/shared/i18n/de';
import { renderCommunityRating } from '../../src/modules/watchlist/ui/CommunityRating';
import { GroupDetailModal, renderCreditsRows } from '../../src/modules/watchlist/ui/TitleDetailModal';
import { GameGroupDetailModal } from '../../src/modules/games/ui/GameDetailModal';
import { El } from '../helpers/fakeEl';
import { makeTitle } from '../helpers/setupDataManager';
import { fakeSettings } from '../helpers/fakeSettings';

afterEach(() => setLocale('en'));

function allText(el: El): string[] {
	return [el.text, ...Object.values(el.attr), ...el.children.flatMap(allText)].filter(Boolean);
}

function domText(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll('*')).flatMap((e) => [
		e.textContent ?? '',
		...Array.from(e.attributes).map((a) => a.value),
	]).filter(Boolean);
}

describe('detail modals i18n', () => {
	it('renders the community rating badge in German', () => {
		setLocale('de');
		const parent = new El('root');
		const title = makeTitle({ id: 'a' });
		const titles = { getTitle: () => title };
		renderCommunityRating(parent as never, titles as never, {} as never, {} as never, 'a');
		const texts = allText(parent);
		expect(texts).toContain(de.detail.community.empty);
		expect(texts).toContain(de.detail.community.refresh);
	});

	it('renders the group modal header in German', () => {
		setLocale('de');
		const modal = new GroupDetailModal(
			{} as never, {} as never, { getEffectiveTotal: () => 0 }, {} as never, vi.fn(), vi.fn(),
			{ group: { name: 'Marvel' } as never, members: [] },
		);
		(modal as unknown as { renderAll: () => void }).renderAll();
		const texts = domText(modal.contentEl);
		expect(texts).toContain('0 Titel');
		expect(texts).toContain(de.list.stat.progress);
	});

	it('renders the game group modal count in German', () => {
		setLocale('de');
		const modal = new GameGroupDetailModal(
			{} as never,
			fakeSettings({}) as never,
			{ getSettings: () => ({ types: [], statuses: [] }) } as never,
			vi.fn(),
			{ group: { name: 'Zelda' } as never, members: [] },
		);
		(modal as unknown as { renderAll: () => void }).renderAll();
		expect(domText(modal.contentEl)).toContain('0 Spiele');
	});

	it('picks singular and plural studio labels', () => {
		const render = (studio: string[]): string[] => {
			const parent = new El('root');
			renderCreditsRows(parent as never, makeTitle({ studio, director: ['D'] }), { includeStudio: true });
			return allText(parent);
		};
		setLocale('de');
		expect(render(['A'])).toContain('Studio');
		expect(render(['A', 'B'])).toContain('Studios');
		expect(render(['A'])).not.toContain('Director');
		expect(render(['A'])).toContain(de.list.searchField.director);
	});
});
