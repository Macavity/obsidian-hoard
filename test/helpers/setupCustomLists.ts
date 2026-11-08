// CustomListsTab on a fake vault with the lists given as in-memory CustomList objects.
import { vi } from 'vitest';
import { createFakeApp } from '../fakes/fakeApp';
import { CustomListsTab } from '../../src/CustomListsTab';
import { VaultLayout } from '../../src/storage/VaultLayout';
import { DEFAULT_SETTINGS, type CustomList, type HoardTitle } from '../../src/types';

// Obsidian's activeDocument (popout-aware document)
(globalThis as { activeDocument?: Document }).activeDocument = document;

const layout = new VaultLayout('W', () => []);

export function listFile(list: CustomList): string {
	const json = JSON.stringify({ columns: list.columns, rows: list.rows, tabColor: list.tabColor, nameWidth: list.nameWidth }, null, 2);
	return `# ${list.name}\n\n## Notes\n${list.notes}\n\n## Data\n\`\`\`json\n${json}\n\`\`\`\n`;
}

export function makeList(over: Partial<CustomList> = {}): CustomList {
	return {
		name: 'Backlog',
		notes: '',
		columns: [
			{ id: 'name', label: 'Name', type: 'text', locked: true },
			{ id: 'col_1', label: 'Score', type: 'number' },
			{ id: 'col_2', label: 'Mood', type: 'select', options: ['happy'] },
		],
		rows: [
			{ id: 'row_1', name: 'Alpha', col_1: 5, col_2: 'happy' },
			{ id: 'row_2', name: 'Beta', col_1: 3 },
		],
		...over,
	};
}

export async function setupCustomLists(lists: CustomList[], titles: Partial<HoardTitle>[] = []) {
	const files: Record<string, string> = {};
	for (const list of lists) files[`${layout.customListsFolder}/${list.name}.md`] = listFile(list);
	const f = createFakeApp(files);
	const plugin = {
		app: f.app,
		settings: { ...DEFAULT_SETTINGS },
		getLayout: () => layout,
		saveSettings: vi.fn(() => Promise.resolve()),
	};
	const dataManager = {
		getTitles: () => titles,
		calcTimeRemainingForModal: vi.fn(() => 42),
	};
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new CustomListsTab(container, plugin as never, dataManager as never);
	await tab.render();
	const stored = (name: string): CustomList => {
		const content = f.files.get(`${layout.customListsFolder}/${name}.md`)!;
		const json = /```json\n([\s\S]*?)\n```/.exec(content)![1]!;
		return { ...makeList(), ...(JSON.parse(json) as Partial<CustomList>), name };
	};
	return { f, plugin, dataManager, container, tab, stored };
}
