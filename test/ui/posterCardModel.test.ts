import { describe, expect, it } from 'vitest';
import { posterCardModel, type PosterCardSpec } from '../../src/design-system/PosterCard';

const base: PosterCardSpec = { title: 'T', placeholderColor: '#000', onClick: () => {} };
const model = (over: Partial<PosterCardSpec>) => posterCardModel({ ...base, ...over });

describe('posterCardModel', () => {
	it('derives the image size', () => {
		expect(model({ cardWidth: 100, textUnder: true }).imgSize).toEqual({ width: 100, height: 150 });
		expect(model({ cardWidth: 100, cardHeight: 160 }).imgSize).toEqual({ width: 100, height: 160 });
		expect(model({ cardWidth: 100 }).imgSize).toEqual({ width: 100, height: 150 });
		expect(model({}).imgSize).toBeNull();
	});
	it('rounds the image size', () => {
		expect(model({ cardWidth: 100.4, cardHeight: 160.6 }).imgSize).toEqual({ width: 100, height: 161 });
	});
	it('picks the poster kind', () => {
		expect(model({ posterUrl: 'https://x/p.jpg' }).poster).toEqual({ kind: 'image', url: 'https://x/p.jpg' });
		expect(model({ posterUrl: 'app://x', needsPoster: true }).poster).toEqual({ kind: 'lazy' });
		expect(model({ posterUrl: null }).poster).toEqual({ kind: 'none' });
	});
	it('clamps the progress width', () => {
		expect(model({ progressRatio: 0.5 }).progressWidth).toBe('50%');
		expect(model({ progressRatio: 1.4 }).progressWidth).toBe('100%');
		expect(model({ progressRatio: -1 }).progressWidth).toBe('0%');
		expect(model({}).progressWidth).toBeNull();
	});
	it('builds the meta row only with a type label', () => {
		expect(model({ year: '2020' }).meta).toBeNull();
		expect(model({ typeLabel: 'Film', typeColor: '#f00', year: '2020' }).meta).toEqual({
			typeLabel: 'Film',
			typeColor: '#f00',
			year: '2020',
		});
	});
	it('builds the menu only with items', () => {
		const x = { label: 'x', onClick: () => {} };
		expect(model({ menuItems: [] }).menu).toBeNull();
		expect(model({}).menu).toBeNull();
		expect(model({ menuItems: [x], menuAriaLabel: 'More' }).menu).toEqual({ label: 'More', items: [x] });
	});
	it('falls back to the default menu label', () => {
		const x = { label: 'x', onClick: () => {} };
		expect(model({ menuItems: [x] }).menu?.label).toBeTruthy();
	});
	it('picks the text classes', () => {
		expect(model({ textUnder: true })).toMatchObject({ titleCls: 'hoard-card__under-title', yearCls: 'hoard-card__under-year' });
		expect(model({})).toMatchObject({ titleCls: 'hoard-card__title', yearCls: 'hoard-card__year' });
	});
});
