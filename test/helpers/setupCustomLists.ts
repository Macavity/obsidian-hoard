// CustomListsTab on a fake vault with the lists given as in-memory CustomList objects.
import { vi } from 'vitest';
import { createFakeApp } from '../fakes/fakeApp';
import { fakeSettings } from './fakeSettings';
import { CustomListsTab } from '../../src/modules/custom-lists/ui/CustomListsTab';
import { CustomListManager } from '../../src/modules/custom-lists/services/CustomListManager';
import { VaultLayout } from '../../src/shared/storage/VaultLayout';
import { DEFAULT_SETTINGS, type CustomList, type HoardTitle } from '../../src/shared/domain/types';

// Obsidian's activeDocument (popout-aware document)
(globalThis as { activeDocument?: Document }).activeDocument = document;

const layout = new VaultLayout('W', () => []);

function listFile(list: CustomList): string {
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
	const dataManager = {
		getTitles: () => titles,
		calcTimeRemainingForModal: vi.fn(() => 42),
	};
	const settingsService = fakeSettings({ ...DEFAULT_SETTINGS });
	const openAdd = vi.fn();
	const deps = {
		app: f.app,
		settings: settingsService,
		layout: () => layout,
		titles: dataManager,
		reading: { getBooks: () => [], getMangaList: () => [] },
		games: { getGames: () => [] },
		openAdd,
		listManager: (onConflict?: (list: CustomList) => void) =>
			new CustomListManager({ app: f.app, layout: () => layout, onCorrupt: () => {} }, onConflict),
	};
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new CustomListsTab(container, deps as never);
	await tab.render();
	const stored = (name: string): CustomList => {
		const content = f.files.get(`${layout.customListsFolder}/${name}.md`)!;
		const json = /```json\n([\s\S]*?)\n```/.exec(content)![1]!;
		return { ...makeList(), ...(JSON.parse(json) as Partial<CustomList>), name };
	};
	return { f, deps, settingsService, openAdd, dataManager, container, tab, stored };
}
