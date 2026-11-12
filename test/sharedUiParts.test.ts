import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { createFavoriteButton, markDetailRoot, mobileRowClass } from '../src/ui/detailFrame';
import { createSeasonHeader } from '../src/ui/EpisodeGrid';
import { createPosterPlaceholder, loadCardPoster } from '../src/PosterCard';

const platform = Platform as { isMobile: boolean };

describe('detail frame', () => {
	afterEach(() => {
		platform.isMobile = false;
	});

	it('adds the mobile modifier to a row on a mobile device only', () => {
		platform.isMobile = false;
		expect(mobileRowClass('row', 'row--mobile')).toBe('row');
		platform.isMobile = true;
		expect(mobileRowClass('row', 'row--mobile')).toBe('row row--mobile');
	});

	it('marks modal and content root with the active theme', () => {
		const modalEl = createDiv();
		const contentEl = createDiv();
		markDetailRoot(modalEl, contentEl, 'sakura');
		expect(modalEl.getAttribute('data-theme')).toBe('sakura');
		expect(contentEl.getAttribute('data-theme')).toBe('sakura');
		expect(contentEl.className).toBe('hoard-view hoard-detail');
	});

	it('falls back to the default theme', () => {
		const contentEl = createDiv();
		markDetailRoot(createDiv(), contentEl, undefined);
		expect(contentEl.getAttribute('data-theme')).toBe('default');
	});

	it('creates the favorite button inside the footer', () => {
		const footer = createDiv();
		const btn = createFavoriteButton(footer);
		expect(btn.parentElement).toBe(footer);
		expect(btn.className).toBe('hoard-detail__favorite-btn');
		expect(btn.getAttribute('type')).toBe('button');
	});
});

describe('season header', () => {
	it('builds wrap, header and a badge in the palette colour of its index', () => {
		const parent = createDiv();
		const { seasonWrap, seasonHeader } = createSeasonHeader(parent, 'Season 2', 3, ['#111111', '#222222']);
		expect(seasonWrap.parentElement).toBe(parent);
		expect(seasonHeader.parentElement).toBe(seasonWrap);
		const badge = seasonHeader.querySelector<HTMLElement>('.hoard-accordion__season-badge')!;
		expect(badge.textContent).toBe('Season 2');
		expect(badge.style.getPropertyValue('--hoard-accordion-season-color')).toBe('#222222');
	});

	it('uses grey when the palette is empty', () => {
		const { seasonHeader } = createSeasonHeader(createDiv(), 'S1', 0, []);
		const badge = seasonHeader.querySelector<HTMLElement>('.hoard-accordion__season-badge')!;
		expect(badge.style.getPropertyValue('--hoard-accordion-season-color')).toBe('#888780');
	});
});

describe('poster card parts', () => {
	it('shows the first letter of the title on the placeholder', () => {
		const card = createDiv();
		const placeholder = createPosterPlaceholder(card, '  alien', '#abcdef');
		expect(placeholder.parentElement).toBe(card);
		expect(placeholder.textContent).toBe('A');
		expect(placeholder.style.getPropertyValue('--hoard-card-placeholder-color')).toBe('#abcdef');
	});

	it('shows a question mark for an empty title', () => {
		expect(createPosterPlaceholder(createDiv(), ' ', '#000000').textContent).toBe('?');
	});

	it('loads the poster, marks the card on load and reports a broken image', () => {
		const card = createDiv();
		const img = card.createEl('img', { cls: 'hoard-card__poster' });
		const onError = vi.fn();
		loadCardPoster(card, 'https://example.com/p.jpg', onError);
		expect(img.src).toBe('https://example.com/p.jpg');
		img.onload?.(new Event('load'));
		expect(card.classList.contains('has-poster')).toBe(true);
		img.onerror?.(new Event('error'));
		expect(onError).toHaveBeenCalledOnce();
	});

	it('does nothing for a card without a poster image', () => {
		const onError = vi.fn();
		expect(() => loadCardPoster(createDiv(), 'x', onError)).not.toThrow();
		expect(onError).not.toHaveBeenCalled();
	});
});
