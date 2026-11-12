import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en';
import { ROWS_SHELVES } from '../../src/types';
import { movieNote, showNote, setupListTab } from '../helpers/setupListTab';

const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));

const only = (id: string) => ROWS_SHELVES.map((sh) => ({ id: sh.id, enabled: sh.id === id }));

const files = (): Record<string, string> => ({
	'W/Movie/A.md': movieNote('A', 'Groups: [Saga]\nStatus: Watching\n'),
	'W/Movie/B.md': movieNote('B', 'Groups: [Saga]\n'),
	'W/TV Show/C.md': showNote('C', 'Status: Completed\n'),
});

describe('ListTab rows view', () => {
	it('renders the groups shelf with one card per group and a count line', async () => {
		const { tab, container } = await setupListTab(files(), {}, 'rows');
		tab.render();
		expect(q(container, '.hoard-toolbar__results-count').textContent).toContain('3 titles');
		expect(q(container, '.hoard-toolbar__results-count').textContent).toContain('1 group');
		const strip = qa(container, '.hoard-rows-view__strip');
		expect(strip.length).toBeGreaterThan(0);
		expect(qa(container, '.hoard-card--group')).toHaveLength(1);
	});

	it('renders the empty groups shelf message when there are no groups', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') }, {}, 'rows');
		tab.render();
		expect(q(container, '.hoard-rows-view__shelf-empty')).not.toBeNull();
		expect(qa(container, '.hoard-card--group')).toHaveLength(0);
	});

	it('hides the groups shelf while a search matches nothing in it', async () => {
		const { tab, container } = await setupListTab(files(), {}, 'rows');
		tab.searchQuery = 'zzzz';
		tab.render();
		expect(qa(container, '.hoard-card--group')).toHaveLength(0);
		expect(container.querySelector('.hoard-rows-view__shelf-empty')).toBeNull();
	});

	it('keeps the group under a search that matches a member or the name', async () => {
		const { tab, container } = await setupListTab(files(), {}, 'rows');
		tab.searchQuery = 'saga';
		tab.render();
		expect(qa(container, '.hoard-card--group')).toHaveLength(1);
	});

	it('drops groups excluded by group filter or without a passing member', async () => {
		const { tab, container } = await setupListTab(files(), {}, 'rows');
		tab.filterGroupExclude = new Set(['Saga']);
		tab.render();
		expect(qa(container, '.hoard-card--group')).toHaveLength(0);
		tab.filterGroupExclude = new Set();
		tab.filterStatusExclude = new Set(['Watching', 'Plan to watch']);
		tab.render();
		expect(qa(container, '.hoard-card--group')).toHaveLength(0);
		tab.filterStatusExclude = new Set(['Completed']);
		tab.render();
		expect(qa(container, '.hoard-card--group')).toHaveLength(1);
	});

	it('renders by-type buckets in settings order, with typed titles', async () => {
		const { tab, container } = await setupListTab(files(), {
			rowsLayout: only('byType'),
		}, 'rows');
		tab.render();
		expect(q(container, '.hoard-rows-view__grouped-title').textContent).toBe('By type');
		expect(qa(container, '.hoard-rows-view__grouped-spacer')).toHaveLength(2);
		expect(container.querySelector('.hoard-rows-view__shelf-empty')).toBeNull();
	});

	it('renders by-status buckets', async () => {
		const { tab, container } = await setupListTab(files(), {
			rowsLayout: only('byStatus'),
		}, 'rows');
		tab.render();
		expect(q(container, '.hoard-rows-view__grouped-title').textContent).toBe('By status');
		expect(qa(container, '.hoard-rows-view__grouped-spacer').length).toBeGreaterThanOrEqual(2);
	});

	it('shows the empty grid message without titles', async () => {
		const { tab, container } = await setupListTab({}, {
			rowsLayout: only('byType'),
		}, 'rows');
		tab.render();
		expect(q(container, '.hoard-rows-view__grouped .hoard-rows-view__shelf-empty')).not.toBeNull();
	});

	it('removes the grid section when filtering leaves it empty', async () => {
		const { tab, container } = await setupListTab(files(), {
			rowsLayout: only('byType'),
		}, 'rows');
		tab.searchQuery = 'zzzz';
		tab.render();
		expect(container.querySelector('.hoard-rows-view__grouped')).toBeNull();
	});

	it('opens the customize modal from the gear button', async () => {
		const { tab, container } = await setupListTab(files(), {}, 'rows');
		tab.render();
		q(container, '.hoard-rows-customize__btn').click();
		expect(document.body.textContent).toContain(en.list.rows.watchlistHint);
	});
});
