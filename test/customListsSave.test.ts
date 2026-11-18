import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomListManager } from '../src/modules/custom-lists/services/CustomListManager';
import { makeList, setupCustomLists } from './helpers/setupCustomLists';

const DATA = '\n## Data\n```json\n{\n  "x": 1\n}\n```\n';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('custom list saves go through vault.process', () => {
	it('saveList on an existing list uses process, not modify', async () => {
		const { f, env, tab } = await setupCustomLists([makeList()]);
		tab.destroy(); // its modify listener reads the note; only the manager's own reads count here
		const manager = new CustomListManager(env.app.vault, env.app.fileManager, env.layout, () => {});
		const list = (await manager.loadList('Backlog'))!;
		const process = vi.spyOn(f.app.vault, 'process');
		const modify = vi.spyOn(f.app.vault, 'modify');
		const read = vi.spyOn(f.app.vault, 'read');
		list.rows[0]!.name = 'Fresh';
		expect(await manager.saveList(list)).toBe(true);
		expect(process).toHaveBeenCalledOnce();
		expect(modify).not.toHaveBeenCalled();
		expect(read).not.toHaveBeenCalled();
		const content = [...f.files.entries()].find(([p]) => p.endsWith('/Backlog.md'))![1];
		expect(content).toMatch(/^# Backlog\n\n## Notes\n\n\n## Data\n```json\n[\s\S]*"name": "Fresh"/);
	});

	it('saveNotes replaces only the notes section and keeps ## Data byte-identical', async () => {
		const { f, env } = await setupCustomLists([makeList()]);
		const manager = new CustomListManager(env.app.vault, env.app.fileManager, env.layout, () => {});
		const path = [...f.files.keys()].find((p) => p.endsWith('/Backlog.md'))!;
		f.files.set(path, `# Backlog\n\n## Notes\nold\n${DATA}`);
		const list = (await manager.loadList('Backlog'))!;
		const modify = vi.spyOn(f.app.vault, 'modify');
		const process = vi.spyOn(f.app.vault, 'process');
		await manager.saveNotes(list, 'new\n');
		expect(process).toHaveBeenCalledOnce();
		expect(modify).not.toHaveBeenCalled();
		expect(f.files.get(path)).toBe(`# Backlog\n\n## Notes\nnew\n${DATA}`);
	});

	it('saveNotes adds a ## Notes heading before ## Data when there is none', async () => {
		const { f, env } = await setupCustomLists([makeList()]);
		const manager = new CustomListManager(env.app.vault, env.app.fileManager, env.layout, () => {});
		const path = [...f.files.keys()].find((p) => p.endsWith('/Backlog.md'))!;
		const original = `# Backlog\n${DATA}`;
		f.files.set(path, original);
		await manager.saveNotes((await manager.loadList('Backlog'))!, 'new');
		expect(f.files.get(path)).toBe(`# Backlog\n\n## Notes\nnew\n\n## Data\n\`\`\`json\n{\n  "x": 1\n}\n\`\`\`\n`);
	});
});

describe('custom list data block', () => {
	const load = async (data: string) => {
		const { f, env, tab } = await setupCustomLists([makeList()]);
		tab.destroy();
		const manager = new CustomListManager(env.app.vault, env.app.fileManager, env.layout, () => {});
		const path = [...f.files.keys()].find((p) => p.endsWith('/Backlog.md'))!;
		f.files.set(path, `# Backlog

## Notes

## Data
\`\`\`json
${data}
\`\`\`
`);
		return manager.loadList('Backlog');
	};

	it('reads a null block as an empty list', async () => {
		const list = await load('null');
		expect(list).toMatchObject({ name: 'Backlog', columns: [], rows: [] });
	});

	it('still reports a block that is not JSON as corrupt', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await load('{')).toBeNull();
		expect(warn).toHaveBeenCalled();
	});
});
