import { describe, it, expect, vi } from 'vitest';
import { setupReadingDataManager, makeBook, makeManga } from './helpers/setupReadingDataManager';
import { tick } from './helpers/common';

describe('ReadingDataManager on vault storage', () => {
	it('stores books as notes and columns in the base, not in data.json', async () => {
		const { rdm, f, local } = await setupReadingDataManager({});
		await rdm.addBook(makeBook({ title: 'Dune', author: 'Frank Herbert', status: 'Reading', pagesRead: 10, totalPages: 600 }));
		await rdm.addColumn('book', { id: 'c1', name: 'Format', type: 'text', options: [] });
		await local.flush();
		expect(f.files.get('W/Books/Dune.md')).toMatch(/Pages Read: 10/);
		expect(f.files.get('W/Hoard.base')).toContain('Format');
		expect(JSON.stringify(f.plugin.data ?? {})).not.toContain('Dune');
		expect(rdm.getBook('Books/Dune')?.vaultPage).toBe('W/Books/Dune.md');
		expect(rdm.getBookColumns()).toHaveLength(1);
	});

	it('writes progress changes to frontmatter and keeps unknown keys and body', async () => {
		const { rdm, f } = await setupReadingDataManager({
			'W/Books/Dune.md': '---\nName: Dune\nType: book\nPages Read: 1\nmyKey: 1\nRating: great\n---\n\n## Notes\n\nkeep\n',
		});
		const b = rdm.getBook('Books/Dune')!;
		await rdm.updateBook({ ...b, pagesRead: 42 });
		const c = f.files.get('W/Books/Dune.md')!;
		expect(c).toMatch(/Pages Read: 42/);
		expect(c).toContain('myKey: 1');
		expect(c).toContain('Rating: great');
		expect(c).toContain('keep');
	});

	it('picks up external changes and notifies', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Manga/Berserk.md': '---\nName: Berserk\nType: manga\nChapters Read: 1\n---\n' });
		let n = 0;
		rdm.onChange(() => n++);
		await f.app.vault.modify(f.app.vault.getAbstractFileByPath('W/Manga/Berserk.md') as never, '---\nName: Berserk\nType: manga\nChapters Read: 9\n---\n');
		await tick();
		expect(rdm.getManga('Manga/Berserk')?.chaptersRead).toBe(9);
		expect(n).toBeGreaterThan(0);
	});

	it('own writes do not notify', async () => {
		const { rdm } = await setupReadingDataManager({});
		await rdm.addManga(makeManga({ title: 'Akira' }));
		let n = 0;
		rdm.onChange(() => n++);
		await tick();
		expect(n).toBe(0);
	});

	it('renames the note on title change and deletes via trash', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\n---\n\n## Notes\nx\n' });
		await rdm.updateBook({ ...rdm.getBook('Books/A')!, title: 'B' });
		expect(f.files.has('W/Books/A.md')).toBe(false);
		expect(f.files.get('W/Books/B.md')).toContain('x');
		await rdm.removeBook('Books/B');
		expect(f.files.has('W/Books/B.md')).toBe(false);
		expect(rdm.getBooks()).toHaveLength(0);
	});

	it('removing a column clears its custom field in notes', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\ncf_c1: hi\n---\n' });
		await rdm.addColumn('book', { id: 'c1', name: 'F', type: 'text', options: [] });
		expect(rdm.getBook('Books/A')?.customFields).toEqual({ c1: 'hi' });
		await rdm.removeColumn('book', 'c1');
		expect(f.files.get('W/Books/A.md')).not.toContain('cf_c1');
	});

	it('splits settings: default status to the base, UI state and colors to data.json', async () => {
		const { rdm, f } = await setupReadingDataManager({});
		await rdm.updateSettings({ defaultStatus: 'Reading', defaultSubTab: 'manga', statusColors: { Reading: '#ABCDEF' }, defaultFolder: 'X' });
				const base = f.files.get('W/Hoard.base')!;
		expect(base).toContain('defaultStatus: Reading');
		for (const k of ['defaultSubTab', 'ABCDEF', 'defaultFolder']) expect(base).not.toContain(k);
		expect(rdm.getSettings().defaultSubTab).toBe('manga');
		expect(rdm.getSettings().statusColors?.Reading).toBe('#ABCDEF');
	});

	it('appends quotes to the Quotes section', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\n---\n\n## Notes\n\n\n## Quotes\n' });
		await rdm.appendQuote('book', rdm.getBook('Books/A')!, 'line', 'p. 1');
		expect(f.files.get('W/Books/A.md')).toContain('> [!quote] p. 1\n> line');
	});

	it('keeps an external change when a stale copy edits another field', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\nPages Read: 1\n---\n' });
		const b = rdm.getBook('Books/A')!;
		f.externalWrite('W/Books/A.md', '---\nName: A\nType: book\nPages Read: 5\n---\n');
		await tick();
		rdm.getBooks();
		b.author = 'X';
		await rdm.updateBook(b);
		const c = f.files.get('W/Books/A.md')!;
		expect(c).toContain('Pages Read: 5');
		expect(c).toContain('Author: X');
	});

	it('flushes dirty silent edits via flushPending', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\n---\n' });
		const b = rdm.getBook('Books/A')!;
		rdm.updateBookSilent({ ...b, author: 'Y' });
		await rdm.flushPending();
		expect(f.files.get('W/Books/A.md')).toContain('Author: Y');
	});

	it('keeps an external change when a spread copy edits another field', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\nPages Read: 1\n---\n' });
		const b = rdm.getBook('Books/A')!;
		f.externalWrite('W/Books/A.md', '---\nName: A\nType: book\nPages Read: 5\n---\n');
		await tick();
		rdm.getBooks();
		await rdm.updateBook({ ...b, author: 'X' });
		const c = f.files.get('W/Books/A.md')!;
		expect(c).toContain('Pages Read: 5');
		expect(c).toContain('Author: X');
	});

	it('toggles favorite silently and stamps/clears Date Favorited', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\n---\n' });
		const before = rdm.getBook('Books/A')!.dateModified;
		await rdm.setFavorite('book', 'Books/A', true);
		expect(rdm.getBook('Books/A')?.favorite).toBe(true);
		expect(f.files.get('W/Books/A.md')).toMatch(/Favorite: true/);
		expect(f.files.get('W/Books/A.md')).toMatch(/Date Favorited:/);
		expect(rdm.getBook('Books/A')?.dateModified).toBe(before);
		await rdm.setFavorite('book', 'Books/A', false);
		expect(rdm.getBook('Books/A')?.dateFavorited).toBeUndefined();
		expect(f.files.get('W/Books/A.md')).not.toMatch(/Date Favorited/);
		await rdm.setFavorite('book', 'missing', true);
	});

	it('toggles favorite on manga and survives a failing note write', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Manga/B.md': '---\nName: B\nType: manga\n---\n' });
		await rdm.setFavorite('manga', 'Manga/B', true);
		expect(rdm.getManga('Manga/B')?.favorite).toBe(true);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const orig = f.app.fileManager.processFrontMatter.bind(f.app.fileManager);
		f.app.fileManager.processFrontMatter = () => Promise.reject(new Error('boom'));
		await rdm.setFavorite('manga', 'Manga/B', false);
		expect(warn).toHaveBeenCalled();
		f.app.fileManager.processFrontMatter = orig;
		warn.mockRestore();
	});

	it('reorders columns and ignores out-of-range indices', async () => {
		const { rdm } = await setupReadingDataManager({});
		for (const id of ['a', 'b', 'c']) await rdm.addColumn('book', { id, name: id, type: 'text', options: [] });
		await rdm.reorderColumns('book', 0, 2);
		expect(rdm.getBookColumns().map((c) => c.id)).toEqual(['b', 'c', 'a']);
		for (const [from, to] of [[-1, 0], [3, 0], [0, -1], [0, 3]] as const) await rdm.reorderColumns('book', from, to);
		expect(rdm.getBookColumns().map((c) => c.id)).toEqual(['b', 'c', 'a']);
	});

	it('sets and clears custom fields in the note', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\n---\n' });
		await rdm.addColumn('book', { id: 'c1', name: 'F', type: 'text', options: [] });
		let n = 0;
		rdm.onChange(() => n++);
		await rdm.setCustomField('book', 'Books/A', 'c1', 'hi');
		expect(rdm.getBook('Books/A')?.customFields).toEqual({ c1: 'hi' });
		expect(f.files.get('W/Books/A.md')).toContain('cf_c1: hi');
		await rdm.setCustomField('book', 'Books/A', 'c1', null);
		expect(rdm.getBook('Books/A')?.customFields).toEqual({});
		expect(f.files.get('W/Books/A.md')).not.toContain('cf_c1');
		await rdm.setCustomField('book', 'Books/A', 'c1', '');
		await rdm.setCustomField('book', 'missing', 'c1', 'x');
		expect(n).toBe(3);
	});

	it('survives a failing note write when setting a custom field', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Manga/B.md': '---\nName: B\nType: manga\n---\n' });
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		f.app.fileManager.processFrontMatter = () => Promise.reject(new Error('boom'));
		await rdm.setCustomField('manga', 'Manga/B', 'c1', 5);
		expect(rdm.getManga('Manga/B')?.customFields).toEqual({ c1: 5 });
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('full rewrite drops omitted keys and stale cf_ keys but keeps unreadable fields', async () => {
		const { rdm, f } = await setupReadingDataManager({
			'W/Books/A.md': '---\nName: A\nType: book\nPages Read: 3\nRating: great\nFavorite: true\ncf_old: x\nmyKey: 1\n---\n\nbody\n',
		});
		const b = rdm.getBook('Books/A')!;
		expect(await rdm.rewriteFrontmatterIfExists('book', { ...b, pagesRead: 7, favorite: false, customFields: {} })).toBe(true);
		const c = f.files.get('W/Books/A.md')!;
		expect(c).toContain('Pages Read: 7');
		expect(c).toContain('Rating: great');
		expect(c).toContain('myKey: 1');
		expect(c).toContain('body');
		expect(c).not.toContain('cf_old');
		expect(c).not.toContain('Favorite');
		expect(await rdm.rewriteFrontmatterIfExists('book', { ...b, id: 'Books/none' })).toBe(false);
	});
});
