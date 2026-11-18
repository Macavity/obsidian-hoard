import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, WorkspaceLeaf } from 'obsidian';
import { HoardView } from '../../src/app/HoardView';
import { qsa } from '../helpers/dom';
import { hoardViewDeps } from '../helpers/hoardViewDeps';

const { Stub, pending, aired, maybe } = vi.hoisted(() => ({
	Stub: class {
		render(): void {}
	},
	pending: vi.fn(() => Promise.resolve(4)),
	aired: vi.fn(() => 2),
	maybe: vi.fn(() => 1),
}));

vi.mock('../../src/modules/dashboard/ui/DashboardTab', () => ({ DashboardTab: Stub }));
vi.mock('../../src/modules/watchlist/ui/ListTab', () => ({ ListTab: Stub }));
vi.mock('../../src/modules/reading/ui/ReadingTab', () => ({ ReadingTab: Stub }));
vi.mock('../../src/modules/games/ui/GamesTab', () => ({ GamesTab: Stub }));
vi.mock('../../src/modules/custom-lists/ui/CustomListsTab', () => ({ CustomListsTab: Stub }));
vi.mock('../../src/modules/log/ui/LogTab', () => ({ LogTab: Stub }));
vi.mock('../../src/modules/airtime/ui/AirtimeTab', () => ({
	AirtimeTab: Object.assign(class extends Stub {}, {
		getAiredDueCount: aired,
		getMaybeDueCount: maybe,
	}),
}));
vi.mock('../../src/modules/drafts/ui/DraftsTab', () => ({
	DraftsTab: Object.assign(class extends Stub {}, { computePendingCount: pending }),
}));

afterEach(() => {
	(Platform as { isMobile: boolean }).isMobile = false;
	pending.mockImplementation(() => Promise.resolve(4));
	aired.mockReturnValue(2);
	maybe.mockReturnValue(1);
});

async function open() {
	let resolved: () => void = () => {};
	const view = new HoardView(new WorkspaceLeaf(), hoardViewDeps((cb) => { resolved = cb; }));
	await view.onOpen();
	const tabs = (): HTMLButtonElement[] => qsa<HTMLButtonElement>(view.contentEl, '.hoard-tab-bar__btn');
	const label = (name: string): string | undefined => tabs().find((b) => b.textContent?.startsWith(name))?.textContent ?? undefined;
	return { view, tabs, label, fireResolved: () => resolved() };
}

describe('HoardView tab badges', () => {
	it('paints sync counts on open and async counts once they resolve', async () => {
		const { tabs, label } = await open();
		expect(tabs()).toHaveLength(8);
		expect(label('Upcoming')).toBe('Upcoming (3)');
		await Promise.resolve();
		expect(label('Drafts')).toBe('Drafts (4)');
		// tabs without a badge keep their plain label
		expect(label('Dashboard')).toBe('Dashboard');
	});

	it('only recomputes the badges of the fired trigger', async () => {
		const { fireResolved, label } = await open();
		await Promise.resolve();
		pending.mockClear();
		aired.mockClear();
		pending.mockImplementation(() => Promise.resolve(0));
		fireResolved();
		await Promise.resolve();
		expect(pending).toHaveBeenCalledTimes(1);
		expect(aired).not.toHaveBeenCalled();
		expect(label('Drafts')).toBe('Drafts');
	});

	it('shows a dot instead of a number on mobile', async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		class RO { observe(): void {} disconnect(): void {} }
		vi.stubGlobal('ResizeObserver', RO);
		try {
			const { tabs } = await open();
			await Promise.resolve();
			const flagged = tabs().filter((b) => b.classList.contains('hoard-tab-bar__btn--has-badge'));
			expect(flagged).toHaveLength(2);
			expect(flagged.every((b) => b.getAttribute('aria-label') !== null)).toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
