import { afterEach, describe, expect, it } from 'vitest';
import type { HoardView } from '../../src/app/HoardView';
import type { TabInstance } from '../../src/shared/ui/TabInstance';
import { newHoardView } from '../helpers/newHoardView';

const destroyed: string[] = [];

/** A tab that records its teardown, or none when it has no destroy (the dashboard). */
const tab = (name: string, withDestroy: boolean) => (): TabInstance => ({
	render: () => {},
	...(withDestroy ? { destroy: () => { destroyed.push(name); } } : {}),
});

afterEach(() => { destroyed.length = 0; });

async function open(): Promise<HoardView> {
	const view = newHoardView({
		create: {
			watchlist: tab('watchlist', true),
			reading: tab('reading', true),
			games: tab('games', true),
			upcoming: tab('upcoming', true),
			'custom-lists': tab('custom-lists', true),
			drafts: tab('drafts', true),
			dashboard: tab('dashboard', false),
			log: tab('log', true),
		},
	});
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
