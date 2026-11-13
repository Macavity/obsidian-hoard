import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupReadingDataManager, makeBook, makeManga } from './helpers/setupReadingDataManager';
import { tick } from './helpers/common';

const NOW = new Date('2026-03-04T05:06:07.000Z');
const BOOK = '---\nName: A\nType: book\nPages Read: 1\n---\n\n## Notes\n\nkeep\n';

type Setup = Awaited<ReturnType<typeof setupReadingDataManager>>;

/** Counts the vault's modify events; they fire a moment after the write. */
function modifyCounter(f: Setup['f']): () => Promise<number> {
	let n = 0;
	f.app.vault.on('modify', () => { n++; });
	return async () => { await tick(20); return n; };
}

/** The next frontmatter update fails the way a note with unreadable YAML does. */
function failNextFrontmatterWrite(f: Setup['f']): void {
	vi.spyOn(f.app.fileManager, 'processFrontMatter').mockRejectedValueOnce(new Error('bad yaml'));
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('reading writes: rename', () => {
	it('moves a book note and writes a field changed in the same edit to it', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		await rdm.updateBook({ ...rdm.getBook('Books/A')!, title: 'A2', pagesRead: 9 });
		expect(f.files.has('W/Books/A.md')).toBe(false);
		const moved = f.files.get('W/Books/A2.md')!;
		expect(moved).toContain('Name: A2');
		expect(moved).toContain('Pages Read: 9');
		expect(moved).toContain('keep');
		expect(rdm.getBook('Books/A')).toBeUndefined();
		expect(rdm.getBook('Books/A2')).toMatchObject({ title: 'A2', pagesRead: 9, vaultPage: 'W/Books/A2.md' });
		expect(rdm.getBooks()).toHaveLength(1);
	});

	it('moves a manga note', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Manga/M.md': '---\nName: M\nType: manga\nChapters Read: 1\n---\n' });
		await rdm.updateManga({ ...rdm.getManga('Manga/M')!, title: 'M2', chaptersRead: 4 });
		expect(f.files.has('W/Manga/M.md')).toBe(false);
		expect(f.files.get('W/Manga/M2.md')).toContain('Chapters Read: 4');
		expect(rdm.getManga('Manga/M2')?.title).toBe('M2');
		expect(rdm.getManga('Manga/M')).toBeUndefined();
	});

	it('keeps the name when a note is already at the target, and still writes the new title', async () => {
		const other = '---\nName: B\nType: book\n---\n';
		const { rdm, f, notices } = await setupReadingDataManager({ 'W/Books/A.md': BOOK, 'W/Books/B.md': other });
		await rdm.updateBook({ ...rdm.getBook('Books/A')!, title: 'B' });
		expect(f.files.get('W/Books/A.md')).toContain('Name: B');
		expect(f.files.get('W/Books/B.md')).toBe(other);
		expect(notices).toEqual([{ code: 'renameTargetExists', target: 'W/Books/B.md' }]);
		expect(rdm.getBook('Books/A')?.title).toBe('B');
	});

	it('renames through a silent edit when it is saved', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		rdm.updateBookSilent({ ...rdm.getBook('Books/A')!, title: 'A2', author: 'Y' });
		expect(f.files.has('W/Books/A.md')).toBe(true);
		await rdm.saveAndNotify();
		expect(f.files.has('W/Books/A.md')).toBe(false);
		expect(f.files.get('W/Books/A2.md')).toContain('Author: Y');
	});

	it('moves a pending id along with the note: the lost silent edit is reported under the new id', async () => {
		const { rdm, f, notices } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		const b = rdm.getBook('Books/A')!;
		rdm.updateBookSilent({ ...b, author: 'Y' });
		await rdm.updateBook({ ...b, title: 'A2' });
		await rdm.saveAndNotify();
		// as today: the rename drops the pending copy, so its author never reaches the note, and the flush says so
		expect(notices).toEqual([{ code: 'editLost', id: 'Books/A2' }]);
		expect(f.files.get('W/Books/A2.md')).not.toContain('Author');
	});
});

describe('reading writes: changed keys only', () => {
	it('leaves unknown keys, unreadable values and the key order alone', async () => {
		const { rdm, f } = await setupReadingDataManager({
			'W/Books/A.md': '---\nmyKey: 1\nName: A\nRating: great\nType: book\nAuthor: old\n---\n',
		});
		await rdm.setFavorite('book', 'Books/A', true);
		const lines = f.files.get('W/Books/A.md')!.split('\n');
		expect(lines.slice(0, 6)).toEqual(['---', 'myKey: 1', 'Name: A', 'Rating: great', 'Type: book', 'Author: old']);
		expect(lines[6]).toBe('Favorite: true');
		expect(lines[7]).toMatch(/^Date Favorited: /);
		expect(lines[8]).toBe('---');
	});

	it('removes the keys of a favorite switched off, for both kinds', async () => {
		const favorite = 'Favorite: true\nDate Favorited: 2026-01-01T00:00:00.000Z\n';
		const { rdm, f } = await setupReadingDataManager({
			'W/Books/A.md': `---\nName: A\nType: book\n${favorite}---\n`,
			'W/Manga/M.md': `---\nName: M\nType: manga\n${favorite}---\n`,
		});
		await rdm.setFavorite('book', 'Books/A', false);
		await rdm.setFavorite('manga', 'Manga/M', false);
		expect(f.files.get('W/Books/A.md')).toBe('---\nName: A\nType: book\n---\n');
		expect(f.files.get('W/Manga/M.md')).toBe('---\nName: M\nType: manga\n---\n');
	});

	it('writes an emptied text field as an empty value, not as a missing key', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\nAuthor: old\n---\n' });
		await rdm.updateBook({ ...rdm.getBook('Books/A')!, author: '' });
		expect(f.files.get('W/Books/A.md')).toContain('Author: ""');
	});
});

describe('reading writes: the live copy', () => {
	it('stays the live copy over several saves', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		const b = rdm.getBook('Books/A')!;
		b.pagesRead = 2;
		await rdm.updateBook(b);
		expect(rdm.getBook('Books/A')).toBe(b);
		b.pagesRead = 3;
		await rdm.updateBook(b);
		await tick();
		expect(rdm.getBook('Books/A')).toBe(b);
		expect(f.files.get('W/Books/A.md')).toContain('Pages Read: 3');
	});
});

describe('reading writes: nothing to write', () => {
	it('does not touch the note and takes a copy made from the stored state as the live copy', async () => {
		vi.setSystemTime(NOW);
		const { rdm, f } = await setupReadingDataManager({});
		await rdm.addBook(makeBook({ title: 'A', dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const before = f.files.get('W/Books/A.md')!;
		const modifies = modifyCounter(f);
		const copy = { ...rdm.getBook('Books/A')! };
		await rdm.updateBook(copy);
		expect(f.files.get('W/Books/A.md')).toBe(before);
		expect(await modifies()).toBe(0);
		expect(rdm.getBook('Books/A')).toBe(copy);
	});

	it('does not take a stale copy as the live copy', async () => {
		vi.setSystemTime(NOW);
		const { rdm, f } = await setupReadingDataManager({});
		await rdm.addBook(makeBook({ title: 'A', pagesRead: 1, dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const copy = { ...rdm.getBook('Books/A')! };
		f.externalWrite('W/Books/A.md', f.files.get('W/Books/A.md')!.replace('Pages Read: 1', 'Pages Read: 5'));
		await tick();
		rdm.getBooks();
		const outside = f.files.get('W/Books/A.md')!;
		await rdm.updateBook(copy);
		expect(f.files.get('W/Books/A.md')).toBe(outside);
		expect(rdm.getBook('Books/A')).not.toBe(copy);
		expect(rdm.getBook('Books/A')?.pagesRead).toBe(5);
	});

	it('keeps treating a stale copy as stale after a save that wrote nothing', async () => {
		vi.setSystemTime(NOW);
		const { rdm, f } = await setupReadingDataManager({});
		await rdm.addBook(makeBook({ title: 'A', pagesRead: 1, dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const copy = { ...rdm.getBook('Books/A')! };
		const outside = async (from: string, to: string): Promise<void> => {
			f.externalWrite('W/Books/A.md', f.files.get('W/Books/A.md')!.replace(from, to));
			await tick();
			rdm.getBooks();
		};
		await outside('Pages Read: 1', 'Pages Read: 5');
		await rdm.updateBook(copy);
		copy.author = 'mine';
		await rdm.updateBook(copy);
		expect(f.files.get('W/Books/A.md')).toContain('Author: mine');
		await outside('Author: mine', 'Author: theirs');
		copy.totalPages = 300;
		await rdm.updateBook(copy);
		const note = f.files.get('W/Books/A.md')!;
		expect(note).toContain('Author: theirs');
		expect(note).toContain('Pages Read: 5');
		expect(note).toContain('Total Pages: 300');
	});

	it('writes nothing for a favorite that is already off', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		const modifies = modifyCounter(f);
		await rdm.setFavorite('book', 'Books/A', false);
		expect(f.files.get('W/Books/A.md')).toBe(BOOK);
		expect(await modifies()).toBe(0);
	});
});

describe('reading writes: a note that cannot be updated', () => {
	it('writes nothing, reports it, and keeps the stored state', async () => {
		const { rdm, f, notices } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		const modifies = modifyCounter(f);
		failNextFrontmatterWrite(f);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await rdm.updateBook({ ...rdm.getBook('Books/A')!, pagesRead: 3 });
		expect(f.files.get('W/Books/A.md')).toBe(BOOK);
		expect(await modifies()).toBe(0);
		expect(notices).toEqual([{ code: 'invalidYaml', file: 'A' }]);
		expect(rdm.getBook('Books/A')?.pagesRead).toBe(1);
	});

	it('writes the same copy in full once the note can be updated again', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		failNextFrontmatterWrite(f);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const copy = { ...rdm.getBook('Books/A')!, pagesRead: 3 };
		await rdm.updateBook(copy);
		await rdm.updateBook(copy);
		expect(f.files.get('W/Books/A.md')).toContain('Pages Read: 3');
	});
});

describe('reading writes: a stale copy', () => {
	it('saved twice, neither re-sends what its first save wrote nor reverts outside changes', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\nPages Read: 1\n---\n' });
		const copy = { ...rdm.getBook('Books/A')! };
		const outside = async (from: string, to: string): Promise<void> => {
			f.externalWrite('W/Books/A.md', f.files.get('W/Books/A.md')!.replace(from, to));
			await tick();
			rdm.getBooks();
		};
		await outside('Pages Read: 1', 'Pages Read: 5');
		copy.author = 'mine';
		await rdm.updateBook(copy);
		expect(f.files.get('W/Books/A.md')).toContain('Author: mine');
		await outside('Author: mine', 'Author: theirs');
		copy.totalPages = 300;
		await rdm.updateBook(copy);
		const note = f.files.get('W/Books/A.md')!;
		expect(note).toContain('Pages Read: 5');
		expect(note).toContain('Author: theirs');
		expect(note).toContain('Total Pages: 300');
	});
});

describe('reading writes: a new note', () => {
	it('leaves no entry behind when the note cannot be created', async () => {
		const { rdm, f } = await setupReadingDataManager({});
		vi.spyOn(f.app.vault, 'create').mockRejectedValueOnce(new Error('disk full'));
		await expect(rdm.addBook(makeBook({ title: 'New' }))).rejects.toThrow('disk full');
		expect(rdm.getBooks()).toEqual([]);
		expect(f.files.has('W/Books/New.md')).toBe(false);
	});

	it('leaves no manga behind either', async () => {
		const { rdm, f } = await setupReadingDataManager({});
		vi.spyOn(f.app.vault, 'create').mockRejectedValueOnce(new Error('disk full'));
		await expect(rdm.addManga(makeManga({ title: 'New' }))).rejects.toThrow('disk full');
		expect(rdm.getMangaList()).toEqual([]);
	});

	it('writes a silent edit once', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': BOOK });
		const modifies = modifyCounter(f);
		rdm.updateBookSilent({ ...rdm.getBook('Books/A')!, pagesRead: 2 });
		expect(f.files.get('W/Books/A.md')).toBe(BOOK);
		await rdm.saveAndNotify();
		await rdm.saveAndNotify();
		expect(f.files.get('W/Books/A.md')).toContain('Pages Read: 2');
		expect(await modifies()).toBe(1);
	});
});
