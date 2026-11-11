import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomListManager } from '../src/CustomListsTab';
import { makeList, setupCustomLists } from './helpers/setupCustomLists';

const DATA = '\n## Data\n```json\n{\n  "x": 1\n}\n```\n';

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('custom list saves go through vault.process', () => {
	it('saveList on an existing list uses process, not modify', async () => {
		const { f, plugin } = await setupCustomLists([makeList()]);
		const manager = new CustomListManager(f.app, plugin as never);
		const process = vi.spyOn(f.app.vault, 'process');
		const modify = vi.spyOn(f.app.vault, 'modify');
		const read = vi.spyOn(f.app.vault, 'read');
		await manager.saveList(makeList({ notes: 'fresh' }));
		expect(process).toHaveBeenCalledOnce();
		expect(modify).not.toHaveBeenCalled();
		expect(read).not.toHaveBeenCalled();
		const content = [...f.files.entries()].find(([p]) => p.endsWith('/Backlog.md'))![1];
		expect(content).toMatch(/^# Backlog\n\n## Notes\nfresh\n\n## Data\n```json\n/);
	});

	it('saveNotes replaces only the notes section and keeps ## Data byte-identical', async () => {
		const { f, plugin } = await setupCustomLists([makeList()]);
		const manager = new CustomListManager(f.app, plugin as never);
		const path = [...f.files.keys()].find((p) => p.endsWith('/Backlog.md'))!;
		f.files.set(path, `# Backlog\n\n## Notes\nold\n${DATA}`);
		const modify = vi.spyOn(f.app.vault, 'modify');
		const process = vi.spyOn(f.app.vault, 'process');
		await manager.saveNotes('Backlog', 'new\n');
		expect(process).toHaveBeenCalledOnce();
		expect(modify).not.toHaveBeenCalled();
		expect(f.files.get(path)).toBe(`# Backlog\n\n## Notes\nnew\n${DATA}`);
	});

	it('saveNotes leaves the file unchanged without a ## Notes heading', async () => {
		const { f, plugin } = await setupCustomLists([makeList()]);
		const manager = new CustomListManager(f.app, plugin as never);
		const path = [...f.files.keys()].find((p) => p.endsWith('/Backlog.md'))!;
		const original = `# Backlog\n${DATA}`;
		f.files.set(path, original);
		await manager.saveNotes('Backlog', 'new\n');
		expect(f.files.get(path)).toBe(original);
	});
});
