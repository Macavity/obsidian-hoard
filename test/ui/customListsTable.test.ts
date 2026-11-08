import { describe, expect, it } from 'vitest';
import { until } from '../helpers/common';
import { makeList, setupCustomLists } from '../helpers/setupCustomLists';

const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));

describe('custom list table', () => {
	it('renders header, count and one body row per list row', async () => {
		const { container } = await setupCustomLists([makeList()]);
		expect(q(container, '.hoard-cl-tr-header').textContent).toContain('Score');
		expect(qa(container, '.hoard-cl-tr-body')).toHaveLength(2);
		expect(container.textContent).toContain('2 titles');
		expect(qa(container, '.hoard-cl-td-name').map((e) => e.textContent)).toEqual(['Alpha', 'Beta']);
		expect(qa(container, '.hoard-cl-add-btn')).toHaveLength(2);
	});

	it('omits the library button for unnamed rows', async () => {
		const { container } = await setupCustomLists([makeList({ rows: [{ id: 'row_1', name: '' }] })]);
		expect(container.querySelector('.hoard-cl-add-btn')).toBeNull();
	});

	it('ticks a row and persists it', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		q(container, '.hoard-cl-td-tick .hoard-cl-tick-btn').click();
		await until(() => stored('Backlog').rows[0]!.checked === true);
		await until(() => q(container, '.hoard-cl-tr-body').classList.contains('hoard-cl-tr-checked'));
	});

	it('checks and unchecks all visible rows through the header button', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		q(container, '.hoard-cl-th-tick .hoard-cl-tick-btn').click();
		await until(() => stored('Backlog').rows.every((r) => r.checked === true));
		await until(() => q(container, '.hoard-cl-th-tick .hoard-cl-tick-btn').classList.contains('is-checked'));
		q(container, '.hoard-cl-th-tick .hoard-cl-tick-btn').click();
		await until(() => stored('Backlog').rows.every((r) => r.checked === false));
	});

	it('duplicates a row right below the original', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		q(container, '.hoard-cl-dup-btn').click();
		await until(() => stored('Backlog').rows.length === 3);
		expect(stored('Backlog').rows.map((r) => r.name)).toEqual(['Alpha', 'Alpha', 'Beta']);
	});

	it('deletes a row', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		q(container, '.hoard-cl-row-del').click();
		await until(() => stored('Backlog').rows.length === 1);
		expect(stored('Backlog').rows[0]!.name).toBe('Beta');
	});

	it('moves a dragged row before the row it is dropped on', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		const [first, second] = qa(container, '.hoard-cl-tr-body') as [HTMLElement, HTMLElement];
		q(second, '.hoard-cl-drag-handle').dispatchEvent(new Event('mousedown'));
		expect(second.getAttribute('draggable')).toBe('true');
		second.dispatchEvent(new Event('dragstart'));
		expect(second.classList.contains('hoard-cl-dragging')).toBe(true);
		first.dispatchEvent(new Event('dragover'));
		expect(first.classList.contains('hoard-cl-drag-over')).toBe(true);
		first.dispatchEvent(new Event('dragleave'));
		expect(first.classList.contains('hoard-cl-drag-over')).toBe(false);
		first.dispatchEvent(new Event('drop'));
		second.dispatchEvent(new Event('dragend'));
		expect(second.getAttribute('draggable')).toBe('false');
		await until(() => stored('Backlog').rows[0]!.name === 'Beta');
	});

	it('ignores a drop onto the dragged row', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		const first = q(container, '.hoard-cl-tr-body');
		first.dispatchEvent(new Event('dragstart'));
		first.dispatchEvent(new Event('drop'));
		expect(stored('Backlog').rows[0]!.name).toBe('Alpha');
	});

	it('refreshes an auto-time column from the library titles', async () => {
		const list = makeList({
			columns: [
				{ id: 'name', label: 'Name', type: 'text', locked: true },
				{ id: 'col_1', label: 'Left', type: 'number', autoTime: true },
			],
			rows: [{ id: 'row_1', name: 'Known' }, { id: 'row_2', name: 'Missing' }, { id: 'row_3', name: '  ' }],
		});
		const { container, stored } = await setupCustomLists([list], [{ id: 'k', title: 'Known' }]);
		q(container, '.hoard-cl-autotime-refresh').click();
		await until(() => stored('Backlog').rows[0]!.col_1 === 42);
		const rows = stored('Backlog').rows;
		expect(rows[1]!.col_1).toBe('Not found');
		expect(rows[2]!.col_1).toBeUndefined();
	});

	it('pins column widths on grab, applies the drag and persists on release', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		const handle = q(container, '.hoard-cl-th[data-wl-col="col_1"] .hoard-cl-col-resize');
		handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }));
		expect(document.body.classList.contains('hoard-cl-col-resizing')).toBe(true);
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }));
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(document.body.classList.contains('hoard-cl-col-resizing')).toBe(false);
		await until(() => stored('Backlog').columns.find((c) => c.id === 'col_1')?.width === 190);
		expect(stored('Backlog').columns.find((c) => c.id === 'col_2')?.width).toBe(140);
		expect(stored('Backlog').nameWidth).toBe(140);
	});
});
