import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListTab } from '../../src/ListTab';
import * as ActionBar from '../../src/ui/ActionBar';
import type { HoardTitle, SavedFilterPreset } from '../../src/types';

vi.mock('../../src/ui/ActionBar', () => ({
	renderActionBar: vi.fn(() => ({})),
	renderBatchStatusSelect: vi.fn(),
	renderMoveToGroupSelect: vi.fn(),
}));

const proto = ListTab.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
const call = (host: object, name: string, ...args: unknown[]): unknown => proto[name]!.apply(host, args);
const make = (over: Record<string, unknown>): object =>
	Object.assign(Object.create(ListTab.prototype) as object, over);

describe('ListTab.applyPreset', () => {
	const preset = {
		typeExclude: ['Movie'], statusExclude: ['Dropped'], groupExclude: ['g1'], ratingExclude: ['3'],
		priorityExclude: ['Low'], ratingEmptyOnly: true, recentlyArrivedOnly: true, groupsOnly: true, favoritesOnly: true,
	} as unknown as SavedFilterPreset;
	const settings = { priorities: [{ name: 'High' }, { name: 'Low' }] };

	it('copies every filter from the preset', () => {
		const host = make({ plugin: { settings } }) as Record<string, unknown>;
		call(host, 'applyPreset', preset);
		expect(host['filterTypeExclude']).toEqual(new Set(['Movie']));
		expect(host['filterStatusExclude']).toEqual(new Set(['Dropped']));
		expect(host['filterGroupExclude']).toEqual(new Set(['g1']));
		expect(host['filterRatingExclude']).toEqual(new Set(['3']));
		expect(host['filterPriorityExclude']).toEqual(new Set(['Low']));
		expect(host['filterRatingEmptyOnly']).toBe(true);
		expect(host['filterRecentlyArrivedOnly']).toBe(true);
		expect(host['filterGroupsOnly']).toBe(true);
		expect(host['filterFavoritesOnly']).toBe(true);
	});

	it('defaults missing flags to false and migrates the legacy empty-priority flag', () => {
		const host = make({ plugin: { settings } }) as Record<string, unknown>;
		const legacy = { ...preset, priorityExclude: [], priorityEmptyOnly: true } as unknown as SavedFilterPreset;
		for (const k of ['ratingEmptyOnly', 'recentlyArrivedOnly', 'groupsOnly', 'favoritesOnly']) {
			delete (legacy as unknown as Record<string, unknown>)[k];
		}
		call(host, 'applyPreset', legacy);
		expect(host['filterRatingEmptyOnly']).toBe(false);
		expect(host['filterRecentlyArrivedOnly']).toBe(false);
		expect(host['filterGroupsOnly']).toBe(false);
		expect(host['filterFavoritesOnly']).toBe(false);
		expect(host['filterPriorityExclude']).toEqual(new Set(['High', 'Low']));
	});
});

describe('ListTab.handleCardsVisible', () => {
	const poster = { addClass: vi.fn(), removeClass: vi.fn() };
	const card = (titleId?: string) => ({
		dataset: { titleId },
		querySelector: vi.fn(() => poster),
		addClass: vi.fn(),
	}) as unknown as HTMLElement;
	const titles = [{ id: 't1' }, { id: 't2', posterUrl: 'http://p' }] as unknown as HoardTitle[];

	let enqueue: ReturnType<typeof vi.fn>;
	let host: object;
	beforeEach(() => {
		poster.addClass.mockClear();
		poster.removeClass.mockClear();
		enqueue = vi.fn(() => Promise.resolve('http://new'));
		host = make({
			dataManager: { getTitles: vi.fn(() => titles) },
			plugin: { posterService: { enqueue } },
			applyPosterToCard: vi.fn(),
		});
	});

	it('skips cards without id, unknown titles and titles that already have a poster', () => {
		call(host, 'handleCardsVisible', [card(undefined), card('missing'), card('t2')]);
		expect(enqueue).not.toHaveBeenCalled();
	});

	it('loads the poster once resolved and clears the loading state', async () => {
		const c = card('t1');
		call(host, 'handleCardsVisible', [c]);
		expect(poster.addClass).toHaveBeenCalledWith('is-loading');
		expect(enqueue).toHaveBeenCalledWith(titles[0]);
		await Promise.resolve();
		await Promise.resolve();
		expect(poster.removeClass).toHaveBeenCalledWith('is-loading');
		expect((host as Record<string, ReturnType<typeof vi.fn>>)['applyPosterToCard']).toHaveBeenCalledWith(c, 'http://new');
	});

	it('does not apply a poster when none was found', async () => {
		enqueue.mockResolvedValue(null);
		call(host, 'handleCardsVisible', [card('t1')]);
		await Promise.resolve();
		await Promise.resolve();
		expect(poster.removeClass).toHaveBeenCalledWith('is-loading');
		expect((host as Record<string, ReturnType<typeof vi.fn>>)['applyPosterToCard']).not.toHaveBeenCalled();
	});
});

describe('ListTab.renderActionBar batch status', () => {
	it('sets the status on selected titles only and saves once', async () => {
		const t1 = { id: 't1', status: 'Plan to watch' };
		const t2 = { id: 't2', status: 'Plan to watch' };
		const dm = {
			getGroups: vi.fn(() => [{ id: 'g1', name: 'G', titleIds: [] }]),
			getTitle: vi.fn((id: string) => ({ t1, t2 } as Record<string, unknown>)[id]),
			updateTitleSilent: vi.fn(),
			save: vi.fn(() => Promise.resolve()),
			updateMarkdownFile: vi.fn(() => Promise.resolve()),
		};
		const render = vi.fn();
		const host = make({
			plugin: { app: {}, settings: { statuses: [{ name: 'Watching' }, { name: 'To be released' }] } },
			dataManager: dm,
			selectedItems: new Set(['t1', 'group:g1', 'ghost', 't2']),
			render,
		});
		call(host, 'renderActionBar', {});

		const [, statuses, onChange] = vi.mocked(ActionBar.renderBatchStatusSelect).mock.calls[0]!;
		expect(statuses).toEqual(['Watching']);
		await (onChange)('Watching');

		expect(t1.status).toBe('Watching');
		expect(t2.status).toBe('Watching');
		expect(dm.updateTitleSilent).toHaveBeenCalledTimes(2);
		expect(dm.save).toHaveBeenCalledOnce();
		expect(dm.updateMarkdownFile).toHaveBeenCalledTimes(2);
		expect(render).toHaveBeenCalledOnce();
	});

	it('does not save when nothing was updated', async () => {
		const dm = {
			getGroups: vi.fn(() => []), getTitle: vi.fn(() => undefined),
			updateTitleSilent: vi.fn(), save: vi.fn(), updateMarkdownFile: vi.fn(),
		};
		const render = vi.fn();
		const host = make({
			plugin: { app: {}, settings: { statuses: [] } },
			dataManager: dm, selectedItems: new Set(['ghost']), render,
		});
		vi.mocked(ActionBar.renderBatchStatusSelect).mockClear();
		call(host, 'renderActionBar', {});
		const onChange = vi.mocked(ActionBar.renderBatchStatusSelect).mock.calls[0]![2];
		await onChange('Watching');
		expect(dm.save).not.toHaveBeenCalled();
		expect(render).toHaveBeenCalledOnce();
	});
});
