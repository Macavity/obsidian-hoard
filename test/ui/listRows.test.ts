import { describe, expect, it } from 'vitest';
import { until } from '../helpers/common';
import { movieNote, setupListTab, showNote } from '../helpers/setupListTab';

const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));

const today = (): string => new Date().toLocaleDateString('sv');

describe('ListTab title rows', () => {
	it('renders title, badges, year, priority, rating, status and progress', async () => {
		const { tab, container } = await setupListTab({
			'W/Movie/A.md': movieNote('A', 'rating: 4\nstatus: Watching\npriority: High\nreleaseDate: 2020-05-01\ndateStarted: 2021-03-04\n'),
		});
		tab.render();
		const row = q(container, '.hoard-row');
		expect(row.dataset.titleId).toBe('Movie/A');
		expect(q(row, '.hoard-row-title-text').textContent).toBe('A');
		expect(q(row, '.hoard-row-year').textContent).toBe('2020');
		expect(q(row, '.hoard-priority-badge').textContent).toBe('High');
		expect(q(row, '.hoard-col-rating').textContent).toContain('4/5');
		expect(q(row, '.hoard-col-status .hoard-badge').textContent).toBe('Watching');
		expect(q(row, '.hoard-col-status .hoard-badge').getAttribute('title')).toBe('Watching');
		expect(q(row, '.hoard-col-started').textContent).not.toBe('—');
		expect(row.querySelector('.hoard-recently-arrived')).toBeNull();
	});

	it('shows placeholders for missing rating, start date and priority', async () => {
		const { tab, container } = await setupListTab({
			'W/Movie/A.md': movieNote('A', 'priority: ""\n'),
		}, { coloredTypeBadges: false });
		tab.render();
		const row = q(container, '.hoard-row');
		expect(q(row, '.hoard-col-rating .hoard-row-rating-empty').textContent).toBe('—');
		expect(q(row, '.hoard-col-started').textContent).toBe('—');
		expect(row.querySelector('.hoard-priority-badge')).toBeNull();
		expect(row.querySelector('.hoard-row-year')).toBeNull();
		expect(q(row, '.hoard-col-status .hoard-badge-plain')).not.toBeNull();
	});

	it('flags recently released titles', async () => {
		const { tab, container } = await setupListTab({
			'W/Movie/A.md': movieNote('A', `releaseDate: ${today()}\n`),
		});
		tab.render();
		expect(q(container, '.hoard-recently-arrived').textContent).toContain('Recently arrived');
	});

	it('expands the accordion on click and collapses it on the second click', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		tab.render();
		q(container, '.hoard-row').click();
		expect(tab.expandedId).toBe('Movie/A');
		expect(container.querySelector('.hoard-accordion')).not.toBeNull();
		expect(q(container, '.hoard-row').classList.contains('is-expanded')).toBe(true);
		q(container, '.hoard-row').click();
		expect(tab.expandedId).toBeNull();
		expect(container.querySelector('.hoard-accordion')).toBeNull();
	});

	it('toggles selection through the checkbox and the row click in selection mode', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		(tab as unknown as { selectionMode: boolean }).selectionMode = true;
		tab.render();
		const cb = q(container, '.hoard-col-select input') as HTMLInputElement;
		cb.dispatchEvent(new Event('change'));
		expect(tab.selectedItems.has('Movie/A')).toBe(true);
		expect(q(container, '.hoard-row').classList.contains('hoard-row-selected')).toBe(true);
		q(container, '.hoard-row').click();
		expect(tab.selectedItems.has('Movie/A')).toBe(false);
		expect(tab.expandedId).toBeNull();
	});

	it('renders pre-selected rows as selected', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		tab.selectedItems.add('Movie/A');
		tab.render();
		expect(q(container, '.hoard-row').classList.contains('hoard-row-selected')).toBe(true);
	});

	it('pins a title and unpins every other pinned one', async () => {
		const { tab, container, dm } = await setupListTab({
			'W/Movie/A.md': movieNote('A', 'pinned: true\n'),
			'W/Movie/B.md': movieNote('B', 'dateAdded: 2000-01-01T00:00:00.000Z\n'),
		});
		tab.render();
		const rowB = qa(container, '.hoard-row').find((r) => r.dataset.titleId === 'Movie/B')!;
		q(rowB, '.hoard-pin-icon').click();
		await until(() => dm.getTitle('Movie/B')?.pinned === true);
		expect(dm.getTitle('Movie/A')?.pinned).toBe(false);
	});

	it('unpins the pinned title', async () => {
		const { tab, container, dm } = await setupListTab({ 'W/Movie/A.md': movieNote('A', 'pinned: true\n') });
		tab.render();
		const pin = q(container, '.hoard-pin-icon');
		expect(pin.classList.contains('is-pinned')).toBe(true);
		pin.click();
		await until(() => dm.getTitle('Movie/A')?.pinned === false);
	});
});

const groupFiles = (): Record<string, string> => ({
	'W/Movie/A.md': movieNote('A', 'groups: [Saga]\nstatus: Completed\nrating: 4\npriority: Low\ndateStarted: 2022-01-02\n'),
	'W/Movie/B.md': movieNote('B', 'groups: [Saga]\nstatus: Plan to watch\nrating: 2\npriority: High\ndateStarted: 2021-01-02\n'),
});

describe('ListTab group rows', () => {
	it('summarises the members', async () => {
		const { tab, container } = await setupListTab(groupFiles());
		tab.render();
		const row = q(container, '.hoard-group-row');
		expect(row.dataset.group).toBe('Saga');
		expect(row.dataset.type).toBe('Movie');
		expect(row.dataset.status).toBe('In Progress');
		expect(row.dataset.priority).toBe('High');
		expect(row.dataset.rating).toBe('3★');
		expect(q(row, '.hoard-group-name').textContent).toBe('Saga');
		expect(q(row, '.hoard-group-stats').textContent).toContain('2 titles');
		expect(q(row, '.hoard-priority-badge').textContent).toBe('High');
		expect(q(row, '.hoard-col-rating').textContent).toContain('3.0/5');
		expect(q(row, '.hoard-col-status .hoard-badge').textContent).toBe('In progress');
		expect(q(row, '.hoard-col-started').textContent).not.toBe('—');
	});

	it('shows placeholders for an unrated group without priority or start', async () => {
		const { tab, container } = await setupListTab({
			'W/Movie/A.md': movieNote('A', 'groups: [Saga]\npriority: ""\n'),
		}, { coloredTypeBadges: false });
		tab.render();
		const row = q(container, '.hoard-group-row');
		expect(q(row, '.hoard-col-rating .hoard-row-rating-empty')).not.toBeNull();
		expect(q(row, '.hoard-col-started').textContent).toBe('—');
		expect(row.querySelector('.hoard-priority-badge')).toBeNull();
		expect(q(row, '.hoard-col-status .hoard-badge-plain')).not.toBeNull();
	});

	it('expands to indented member rows and collapses again', async () => {
		const { tab, container } = await setupListTab(groupFiles());
		tab.render();
		q(container, '.hoard-group-row').click();
		expect(tab.expandedGroups.has('Saga')).toBe(true);
		expect(qa(container, '.hoard-row-indented')).toHaveLength(2);
		q(container, '.hoard-group-row').click();
		expect(tab.expandedGroups.has('Saga')).toBe(false);
		expect(container.querySelector('.hoard-row-indented')).toBeNull();
	});

	it('switches to rename mode and saves a new name on Enter', async () => {
		const { tab, container, dm } = await setupListTab(groupFiles());
		tab.render();
		q(container, '.hoard-group-name-row button').click();
		expect(tab.renamingGroupId).toBe('Saga');
		const input = q(container, '.hoard-group-rename-input') as HTMLInputElement;
		input.value = 'Epic';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await until(() => tab.renamingGroupId === null);
		expect(dm.getGroups().some((g) => g.name === 'Epic')).toBe(true);
	});

	it('cancels rename on Escape, the cancel button, and ignores row clicks meanwhile', async () => {
		const { tab, container } = await setupListTab(groupFiles());
		tab.renamingGroupId = 'Saga';
		tab.render();
		q(container, '.hoard-group-row').click();
		expect(tab.expandedGroups.size).toBe(0);
		q(container, '.hoard-group-rename-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(tab.renamingGroupId).toBeNull();
		tab.renamingGroupId = 'Saga';
		tab.render();
		const buttons = qa(container, '.hoard-group-name-row button');
		buttons[1]!.click();
		expect(tab.renamingGroupId).toBeNull();
	});

	it('saves the rename through the check button and keeps an unchanged name', async () => {
		const { tab, container, dm } = await setupListTab(groupFiles());
		tab.renamingGroupId = 'Saga';
		tab.render();
		q(container, '.hoard-group-name-row button').click();
		await until(() => tab.renamingGroupId === null);
		expect(dm.getGroups().map((g) => g.name)).toEqual(['Saga']);
		tab.renamingGroupId = 'Saga';
		tab.render();
		(q(container, '.hoard-group-rename-input') as HTMLInputElement).value = 'Renamed';
		q(container, '.hoard-group-name-row button').click();
		await until(() => dm.getGroups().some((g) => g.name === 'Renamed'));
	});

	it('removes the group after confirming the delete dialog', async () => {
		const { tab, container, dm } = await setupListTab(groupFiles());
		tab.render();
		q(container, '.hoard-group-action-btn-delete').click();
		const confirm = q(document.body, '.hoard-modal-btn-row .hoard-btn-danger');
		confirm.click();
		await until(() => dm.getGroups().length === 0);
	});

	it('pins and unpins the group', async () => {
		const { tab, container, dm } = await setupListTab({
			...groupFiles(),
			'W/Movie/C.md': movieNote('C', 'pinned: true\n'),
		});
		tab.render();
		q(q(container, '.hoard-group-row'), '.hoard-pin-icon').click();
		expect(tab.pinnedGroupId).toBe('Saga');
		await until(() => dm.getTitle('Movie/C')?.pinned === false);
		q(q(container, '.hoard-group-row'), '.hoard-pin-icon').click();
		expect(tab.pinnedGroupId).toBeNull();
	});

	it('toggles group selection via checkbox and row click in selection mode', async () => {
		const { tab, container } = await setupListTab(groupFiles());
		(tab as unknown as { selectionMode: boolean }).selectionMode = true;
		tab.render();
		q(container, '.hoard-group-row .hoard-col-select input').dispatchEvent(new Event('change'));
		expect(tab.selectedItems.has('group:Saga')).toBe(true);
		q(container, '.hoard-group-row').click();
		expect(tab.selectedItems.has('group:Saga')).toBe(false);
		expect(tab.expandedGroups.size).toBe(0);
	});
});

describe('ListTab table and accordion', () => {
	it('shows the empty state and no rows when nothing matches', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		tab.searchQuery = 'zzzz';
		tab.render();
		expect(q(container, '.hoard-empty-state')).not.toBeNull();
		expect(container.querySelector('.hoard-row')).toBeNull();
	});

	it('adds the select column header in selection mode', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		tab.render();
		expect(container.querySelector('.hoard-col-select-h')).toBeNull();
		(tab as unknown as { selectionMode: boolean }).selectionMode = true;
		tab.render();
		expect(q(container, '.hoard-col-select-h')).not.toBeNull();
		expect(q(container, '.hoard-table').classList.contains('hoard-selection-mode')).toBe(true);
	});

	it('shows start date, episode total and external link of a series in the accordion', async () => {
		const { tab, container } = await setupListTab({
			'W/TV Show/C.md': showNote('C', 'dateStarted: 2022-02-02\nexternalLink: https://example.com/c\ntotalEpisodes: 4\n'),
		});
		tab.expandedId = 'TV Show/C';
		tab.render();
		const acc = q(container, '.hoard-accordion');
		expect(q(acc, '.hoard-acc-subtitle-text').textContent).toContain('4 eps');
		const link = q(acc, 'a.hoard-acc-link-icon') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('https://example.com/c');
		expect(link.target).toBe('_blank');
		expect(link.getAttribute('aria-label')).toBe('Open external link');
		expect(link.hasAttribute('title')).toBe(false);
		expect(qa(acc, '.hoard-acc-stat-block')).toHaveLength(3);
		expect(q(acc, '.hoard-accordion-body')).not.toBeNull();
	});

	it('shows the not-started subtitle and a movie body without link', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		tab.expandedId = 'Movie/A';
		tab.render();
		const acc = q(container, '.hoard-accordion');
		expect(q(acc, '.hoard-acc-subtitle-text').textContent).toContain('Not started');
		expect(acc.querySelector('.hoard-acc-link-icon')).toBeNull();
		expect(q(acc, '.hoard-movie-row')).not.toBeNull();
	});

	it('does not toggle the row when clicking inside the accordion', async () => {
		const { tab, container } = await setupListTab({ 'W/Movie/A.md': movieNote('A') });
		tab.expandedId = 'Movie/A';
		tab.render();
		q(container, '.hoard-accordion').click();
		expect(tab.expandedId).toBe('Movie/A');
	});
});
