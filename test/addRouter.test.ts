import { describe, expect, it, vi } from 'vitest';
import { createAddRoute } from '../src/app/AddRouter';
import type { DraftChoiceOptions } from '../src/modules/drafts/ui/DraftChoiceModal';

describe('createAddRoute', () => {
	const calls: { kind: string; opts: Record<string, unknown> }[] = [];
	let choice: DraftChoiceOptions | null = null;
	const open = createAddRoute(
		(opts) => { choice = opts; },
		(opts) => { calls.push({ kind: 'title', opts: opts as never }); },
		(opts) => { calls.push({ kind: 'reading', opts: opts as never }); },
		(opts) => { calls.push({ kind: 'game', opts: opts as never }); },
	);

	function route(pick: 'watchlist' | 'book' | 'manga' | 'game'): { kind: string; opts: Record<string, unknown> } {
		calls.length = 0;
		const onAdded = vi.fn();
		open({ title: 'Dune', onAdded, heading: 'Add draft' });
		expect(choice).toMatchObject({ draftText: 'Dune', heading: 'Add draft' });
		choice!.onChoice(pick);
		expect(calls).toHaveLength(1);
		const call = calls[0]!;
		const done = (call.kind === 'reading' ? call.opts.onSaved : call.opts.onAdded) as () => void;
		done();
		expect(onAdded).toHaveBeenCalledOnce();
		return call;
	}

	it('opens the Watchlist modal prefilled with the title', () => {
		expect(route('watchlist').opts).toMatchObject({ prefill: { searchQuery: 'Dune', title: 'Dune' } });
	});

	it('opens the Game modal prefilled with the title', () => {
		expect(route('game').opts).toMatchObject({ prefill: { searchQuery: 'Dune', title: 'Dune' } });
	});

	it.each(['book', 'manga'] as const)('opens the Reading modal in %s mode with the title', (kind) => {
		expect(route(kind).opts).toMatchObject({ mode: kind, prefillSearch: 'Dune' });
	});
});
