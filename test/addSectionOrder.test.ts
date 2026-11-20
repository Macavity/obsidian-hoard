import { describe, expect, it } from 'vitest';
import { ADD_KINDS } from '../src/modules/add/domain/provider';
import { orderKinds } from '../src/modules/add/domain/sectionOrder';

describe('orderKinds', () => {
	it('puts preferred kinds first, then the canonical order', () => {
		expect(orderKinds(['game', 'anime', 'book'], ['game'])).toStrictEqual(['game', 'anime', 'book']);
		expect(orderKinds(['game', 'anime', 'book'], ['book', 'game'])).toStrictEqual(['book', 'game', 'anime']);
	});

	it('follows ADD_KINDS order without preferences', () => {
		expect(orderKinds(['game', 'book', 'anime'])).toStrictEqual(['anime', 'book', 'game']);
		expect(orderKinds([...ADD_KINDS].reverse())).toStrictEqual([...ADD_KINDS]);
	});

	it('ignores preferred kinds that are not available', () => {
		expect(orderKinds(['anime'], ['game'])).toStrictEqual(['anime']);
	});
});
