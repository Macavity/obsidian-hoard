import { describe, it, expect } from 'vitest';
import { buildPosterCard, type PosterCardSpec } from '../src/PosterCard';
import { renderTypeBadge } from '../src/ui/typeBadge';
import { renderStarRating } from '../src/StarRating';
import type { RatingTier } from '../src/types';

const ctx = (): { container: HTMLElement; cleanups: (() => void)[] } => ({ container: document.createElement('div'), cleanups: [] });
const spec = (over: Partial<PosterCardSpec> = {}): PosterCardSpec => ({
	title: 'Zelda',
	placeholderColor: '#112233',
	statusLabel: 'Playing',
	typeLabel: 'Game',
	onClick: () => {},
	...over,
});
const prop = (el: Element | null, name: string): string => (el as HTMLElement).style.getPropertyValue(name);

describe('PosterCard colours', () => {
	it('passes the colours to CSS variables', () => {
		const card = buildPosterCard(document.createElement('div'), spec({ statusColor: '#aa0000', typeColor: '#00bb00' }), ctx());
		expect(prop(card.querySelector('.hoard-card__poster-placeholder'), '--hoard-card-placeholder-color')).toBe('#112233');
		expect(prop(card.querySelector('.hoard-card__status-badge'), '--hoard-card-status-color')).toBe('#aa0000');
		expect(prop(card.querySelector('.hoard-card__type-badge'), '--hoard-card-type-color')).toBe('#00bb00');
	});

	it('leaves the badge variables absent without a colour', () => {
		const card = buildPosterCard(document.createElement('div'), spec(), ctx());
		expect(prop(card.querySelector('.hoard-card__status-badge'), '--hoard-card-status-color')).toBe('');
		expect(prop(card.querySelector('.hoard-card__type-badge'), '--hoard-card-type-color')).toBe('');
		expect((card.querySelector('.hoard-card__status-badge') as HTMLElement).getAttribute('style')).toBeNull();
	});
});

describe('renderTypeBadge colours', () => {
	const settings = (coloredTypeBadges: boolean, types = [{ name: 'Movie', color: '#336699' }]) => ({ types, coloredTypeBadges, colorTheme: 'default' as const });

	it('sets the badge variable when coloured', () => {
		const badge = renderTypeBadge(document.createElement('div'), 'Movie', settings(true));
		expect(prop(badge, '--hoard-badge-color')).toBe('#336699');
	});

	it('sets no variable for plain badges or unknown types', () => {
		expect(prop(renderTypeBadge(document.createElement('div'), 'Movie', settings(false)), '--hoard-badge-color')).toBe('');
		expect(prop(renderTypeBadge(document.createElement('div'), 'Other', settings(true)), '--hoard-badge-color')).toBe('');
	});
});

describe('renderStarRating colours', () => {
	const tiers: RatingTier[] = ['#111111', '#222222', '#333333', '#444444', '#555555'].map((color, i) => ({ label: `T${i + 1}`, color }));
	const render = (value: number): HTMLElement => {
		const el = document.createElement('div');
		renderStarRating(el, value, { allowHalf: false, tiers, showLabel: true, onChange: () => {} });
		return el;
	};

	it('takes the tier colour for stars and label', () => {
		const el = render(3);
		expect(prop(el, '--hoard-star-rating-color')).toBe('#333333');
		expect(prop(el.querySelector('.hoard-star-rating__label'), '--hoard-star-rating-label-color')).toBe('#333333');
	});

	it('unrated: faint stars, no label variable', () => {
		const el = render(0);
		expect(prop(el, '--hoard-star-rating-color')).toBe('var(--text-faint)');
		expect(prop(el.querySelector('.hoard-star-rating__label'), '--hoard-star-rating-label-color')).toBe('');
	});
});
