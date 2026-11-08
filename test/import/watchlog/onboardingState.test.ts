import { describe, it, expect } from 'vitest';
import { LocalStore } from '../../../src/storage/LocalStore';
import { createFakeApp } from '../../fakes/fakeApp';
import { getDecision, pendingSources, setDecision } from '../../../src/import/watchlog/onboardingState';
import type { ForkSource, OriginalSource } from '../../../src/import/watchlog/detect';

describe('onboardingState', () => {
	it('pending = found and undecided', () => {
		const local = new LocalStore(createFakeApp().plugin);
		const s = { original: {} as OriginalSource, fork: {} as ForkSource, hoardHasData: false };
		expect(pendingSources(local, s)).toEqual(['fork', 'original']);
		setDecision(local, 'fork', 'declined');
		expect(pendingSources(local, s)).toEqual(['original']);
		expect(getDecision(local, 'fork')).toBe('declined');
	});

	it('skips sources that were not found', () => {
		const local = new LocalStore(createFakeApp().plugin);
		expect(pendingSources(local, { original: null, fork: null, hoardHasData: false })).toEqual([]);
	});
});
