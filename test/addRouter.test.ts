import { describe, expect, it, vi } from 'vitest';
import { openAddForTitle, type AddRouterDeps } from '../src/app/AddRouter';

const opened = vi.hoisted(() => ({
	calls: [] as { kind: string; args: unknown[] }[],
	choose: null as ((choice: string) => void) | null,
	heading: undefined as string | undefined,
}));

vi.mock('../src/modules/drafts/ui/DraftChoiceModal', () => ({
	DraftChoiceModal: class {
		constructor(_app: unknown, opts: { onChoice: (c: string) => void; heading?: string }) {
			opened.choose = opts.onChoice;
			opened.heading = opts.heading;
		}
		open(): void {}
	},
}));
vi.mock('../src/modules/watchlist/ui/AddTitleModal', () => ({
	AddTitleModal: class { constructor(...args: unknown[]) { opened.calls.push({ kind: 'title', args }); } open(): void {} },
}));
vi.mock('../src/modules/games/ui/AddGameModal', () => ({
	AddGameModal: class { constructor(...args: unknown[]) { opened.calls.push({ kind: 'game', args }); } open(): void {} },
}));
vi.mock('../src/modules/reading/ui/AddReadingModal', () => ({
	AddReadingModal: class { constructor(...args: unknown[]) { opened.calls.push({ kind: 'reading', args }); } open(): void {} },
}));

describe('openAddForTitle', () => {
	const deps = { app: {} } as unknown as AddRouterDeps;

	function route(choice: string): { kind: string; args: unknown[] } {
		opened.calls.length = 0;
		const onAdded = vi.fn();
		openAddForTitle(deps, { title: 'Dune', onAdded, heading: 'Add draft' });
		expect(opened.heading).toBe('Add draft');
		opened.choose!(choice);
		expect(opened.calls).toHaveLength(1);
		const call = opened.calls[0]!;
		expect(call.args[0]).toBe(deps.app);
		const opts = call.args.at(-1) as { onAdded?: () => void; onSaved?: () => void };
		(call.kind === 'reading' ? opts.onSaved! : opts.onAdded!)();
		expect(onAdded).toHaveBeenCalledOnce();
		return call;
	}

	it('opens the Watchlist modal prefilled with the title', () => {
		const { args } = route('watchlist');
		expect(args.at(-1)).toMatchObject({ prefill: { searchQuery: 'Dune', title: 'Dune' } });
	});

	it('opens the Game modal prefilled with the title', () => {
		const { args } = route('game');
		expect(args.at(-1)).toMatchObject({ prefill: { searchQuery: 'Dune', title: 'Dune' } });
	});

	it.each(['book', 'manga'])('opens the Reading modal in %s mode with the title', (kind) => {
		const { args } = route(kind);
		expect(args.at(-1)).toMatchObject({ mode: kind });
		expect(args.at(-1)).toMatchObject({ prefillSearch: 'Dune' });
	});
});
