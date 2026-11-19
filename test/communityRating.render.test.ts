import { describe, it, expect } from 'vitest';
import { renderCommunityRating } from '../src/modules/watchlist/ui/CommunityRating';
import { makeTitle } from './helpers/setupDataManager';
import { t } from '../src/shared/i18n';
import type { HoardTitle } from '../src/modules/watchlist/exports';

function render(title: HoardTitle | undefined): HTMLElement {
	const parent = document.createElement('div');
	const titles = { getTitle: () => title };
	renderCommunityRating(parent, titles as never, {} as never, {} as never, 'a');
	return parent;
}

describe('renderCommunityRating', () => {
	it('renders nothing for an unknown title', () => {
		expect(render(undefined).childElementCount).toBe(0);
	});

	it('shows source, score and votes when a rating is known', () => {
		const el = render(makeTitle({ id: 'a', communitySource: 'imdb', communityRating: 7.84, communityVotes: 1200 }));
		expect(el.querySelector('.hoard-community-rating__source--imdb')!.textContent).toBe('IMDb');
		expect(el.querySelector('.hoard-community-rating__score')!.textContent).toBe('7.8');
		expect(el.querySelector('.hoard-community-rating__votes')).not.toBeNull();
		expect(el.querySelector('.hoard-community-rating__empty')).toBeNull();
	});

	it('shows AniList as a percentage and skips missing votes', () => {
		const el = render(makeTitle({ id: 'a', communitySource: 'anilist', communityRating: 81.4 }));
		expect(el.querySelector('.hoard-community-rating__score')!.textContent).toBe('81%');
		expect(el.querySelector('.hoard-community-rating__votes')).toBeNull();
	});

	it('shows the empty hint without a rating', () => {
		const el = render(makeTitle({ id: 'a' }));
		expect(el.querySelector('.hoard-community-rating__empty')!.textContent).toBe(t('detail.community.empty'));
	});

	it('builds the refresh as a framed shared icon button', () => {
		const btn = render(makeTitle({ id: 'a' })).querySelector('button.hoard-community-rating__refresh')!;
		expect(btn.classList.contains('hoard-icon-btn')).toBe(true);
		expect(btn.classList.contains('hoard-icon-btn--framed')).toBe(true);
		expect(btn.getAttribute('data-icon')).toBe('refresh-cw');
		expect(btn.getAttribute('aria-label')).toBe(t('detail.community.refresh'));
	});
});
