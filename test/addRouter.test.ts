import { describe, expect, it, vi } from 'vitest';
import { openAddForTitle, type AddRouterDeps } from '../src/app/AddRouter';

const opened = vi.hoisted(() => ({
	calls: [] as { kind: string; args: unknown[] }[],
	choose: null as ((choice: string) => void) | null,
	heading: undefined as string | undefined,
}));

vi.mock('../src/modules/drafts/ui/DraftChoiceModal', () => ({
	DraftChoiceModal: class {
		constructor(_deps: unknown, _text: string, onChoice: (c: string) => void, heading?: string) {
			opened.choose = onChoice;
			opened.heading = heading;
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
		expect(call.args[0]).toBe(deps);
		const done = call.args[call.kind === 'reading' ? 2 : 1] as () => void;
		done();
		expect(onAdded).toHaveBeenCalledOnce();
		return call;
	}

	it('opens the Watchlist modal prefilled with the title', () => {
		const { args } = route('watchlist');
		expect(args[2]).toMatchObject({ searchQuery: 'Dune', title: 'Dune' });
	});

	it('opens the Game modal prefilled with the title', () => {
		const { args } = route('game');
		expect(args[2]).toEqual({ searchQuery: 'Dune', title: 'Dune' });
	});

	it.each(['book', 'manga'])('opens the Reading modal in %s mode with the title', (kind) => {
		const { args } = route(kind);
		expect(args[1]).toBe(kind);
		expect(args[4]).toBe('Dune');
	});
});
