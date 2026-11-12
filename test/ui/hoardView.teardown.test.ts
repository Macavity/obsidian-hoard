import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import { HoardView } from '../../src/HoardView';

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

vi.mock('../../src/DashboardTab', () => ({ DashboardTab: tab('dashboard', false) }));
vi.mock('../../src/ListTab', () => ({ ListTab: tab('watchlist', true) }));
vi.mock('../../src/ReadingTab', () => ({ ReadingTab: tab('reading', true) }));
vi.mock('../../src/GamesTab', () => ({ GamesTab: tab('games', true) }));
vi.mock('../../src/CustomListsTab', () => ({ CustomListsTab: tab('custom-lists', true) }));
vi.mock('../../src/LogTab', () => ({ LogTab: tab('log', true) }));
vi.mock('../../src/AirtimeTab', () => ({
	AirtimeTab: tab('upcoming', true, { getAiredDueCount: () => 0, getMaybeDueCount: () => 0 }),
}));
vi.mock('../../src/DraftsTab', () => ({
	DraftsTab: tab('drafts', true, { computePendingCount: () => Promise.resolve(0) }),
}));

afterEach(() => { destroyed.length = 0; });

async function open(): Promise<HoardView> {
	const plugin = {
		settings: { colorTheme: 'default' },
		app: { metadataCache: { on: () => ({}) } },
		readingDataManager: {},
		gameDataManager: {},
	};
	const dm = { onChange: () => {}, offChange: () => {} };
	const view = new HoardView(new WorkspaceLeaf(), plugin as never, dm as never);
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
