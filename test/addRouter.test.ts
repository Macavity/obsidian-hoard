import { describe, expect, it, vi } from 'vitest';
import { createAddRoute } from '../src/app/AddRouter';
import type { DraftChoiceOptions } from '../src/modules/drafts/ui/DraftChoiceModal';

describe('createAddRoute', () => {
	const calls: { kind: string; opts: Record<string, unknown> }[] = [];
	let choice: DraftChoiceOptions | null = null;
	const open = createAddRoute(
		(opts) => { choice = opts; },
		(opts) => { calls.push({ kind: 'wizard', opts: opts as never }); },
	);

	function route(pick: 'watchlist' | 'book' | 'manga' | 'game'): { kind: string; opts: Record<string, unknown> } {
		calls.length = 0;
		const onAdded = vi.fn();
		open({ title: 'Dune', onAdded, heading: 'Add draft' });
		expect(choice).toMatchObject({ draftText: 'Dune', heading: 'Add draft' });
		choice!.onChoice(pick);
		expect(calls).toHaveLength(1);
		const call = calls[0]!;
		(call.opts.onAdded as () => void)();
		expect(onAdded).toHaveBeenCalledOnce();
		return call;
	}

	it('opens the add wizard on the watchlist kinds with the title as query', () => {
		expect(route('watchlist').opts).toMatchObject({ query: 'Dune', preferredKinds: ['anime', 'series', 'movie'] });
	});

	it.each(['book', 'manga', 'game'] as const)('opens the add wizard on the %s kind with the title as query', (kind) => {
		expect(route(kind).opts).toMatchObject({ query: 'Dune', preferredKinds: [kind] });
	});
});
