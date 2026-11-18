import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import { HoardView } from '../../src/app/HoardView';
import { hoardViewDeps } from '../helpers/hoardViewDeps';

const { tab, destroyed } = vi.hoisted(() => {
	const destroyed: string[] = [];
	const tab = (name: string, withDestroy: boolean, statics: Record<string, unknown> = {}) => {
		class Stub {
			render(): void {}
		}
		if (withDestroy) (Stub.prototype as { destroy?: () => void }).destroy = () => { destroyed.push(name); };
		return Object.assign(Stub, statics);
	};
	return { tab, destroyed };
});

vi.mock('../../src/modules/dashboard/ui/DashboardTab', () => ({ DashboardTab: tab('dashboard', false) }));
vi.mock('../../src/modules/games/ui/GamesTab', () => ({ GamesTab: tab('games', true) }));
vi.mock('../../src/modules/custom-lists/ui/CustomListsTab', () => ({ CustomListsTab: tab('custom-lists', true) }));
vi.mock('../../src/modules/log/ui/LogTab', () => ({ LogTab: tab('log', true) }));
vi.mock('../../src/modules/airtime/ui/AirtimeTab', () => ({
	AirtimeTab: tab('upcoming', true, { getAiredDueCount: () => 0, getMaybeDueCount: () => 0 }),
}));
vi.mock('../../src/modules/drafts/ui/DraftsTab', () => ({
	DraftsTab: tab('drafts', true, { computePendingCount: () => Promise.resolve(0) }),
}));

afterEach(() => { destroyed.length = 0; });

async function open(): Promise<HoardView> {
	const WatchlistStub = tab('watchlist', true);
	const ReadingStub = tab('reading', true);
	const deps = {
		...hoardViewDeps(),
		createListTab: () => new WatchlistStub(),
		createReadingTab: () => new ReadingStub(),
	} as never;
	const view = new HoardView(new WorkspaceLeaf(), deps);
	await view.onOpen();
	return view;
}

describe('HoardView tab teardown', () => {
	it('destroys the previous tab when another tab becomes active', async () => {
		const view = await open();
		view.setActiveTab('watchlist');
		view.setActiveTab('games');
		expect(destroyed).toEqual(['watchlist']);
	});

	it('switches away from a tab without destroy (the dashboard)', async () => {
		const view = await open();
		expect(() => view.setActiveTab('custom-lists')).not.toThrow();
		expect(destroyed).toEqual([]);
	});

	it('destroys the active tab when the view closes', async () => {
		const view = await open();
		view.setActiveTab('reading');
		await view.onClose();
		expect(destroyed).toEqual(['reading']);
	});
});
