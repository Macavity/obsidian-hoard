import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupDataManager, makeTitle } from './helpers/setupDataManager';
import { tick } from './helpers/common';

const NOW = new Date('2026-03-04T05:06:07.000Z');
const NOTE = '---\nName: A\nType: Movie\nRating: 1\n---\n\n## Notes\n\nkeep\n';

type Setup = Awaited<ReturnType<typeof setupDataManager>>;

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

describe('title writes: rename', () => {
	it('moves the note and writes a field changed in the same edit to it', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, title: 'A2', rating: 4 });
		expect(f.files.has('W/Movie/A.md')).toBe(false);
		const moved = f.files.get('W/Movie/A2.md')!;
		expect(moved).toContain('Name: A2');
		expect(moved).toContain('Rating: 4');
		expect(moved).toContain('keep');
		expect(dm.getTitle('Movie/A')).toBeUndefined();
		expect(dm.getTitle('Movie/A2')).toMatchObject({ title: 'A2', rating: 4, notes: 'keep' });
		expect(dm.getTitles()).toHaveLength(1);
	});

	it('moves the note into the folder of a new type', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, type: 'TV Show' });
		expect(f.files.has('W/Movie/A.md')).toBe(false);
		expect(f.files.get('W/TV Show/A.md')).toContain('Type: TV Show');
		expect(dm.getTitle('TV Show/A')?.type).toBe('TV Show');
	});

	it('keeps the name when a note is already at the target, and still writes the new title', async () => {
		const { dm, f, notices } = await setupDataManager({ 'W/Movie/A.md': NOTE, 'W/Movie/B.md': '---\nName: B\nType: Movie\n---\n' });
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, title: 'B' });
		expect(f.files.get('W/Movie/A.md')).toContain('Name: B');
		expect(f.files.get('W/Movie/B.md')).toBe('---\nName: B\nType: Movie\n---\n');
		expect(notices).toEqual([{ code: 'renameTargetExists', target: 'W/Movie/B.md' }]);
		expect(dm.getTitle('Movie/A')?.title).toBe('B');
	});

	it('takes cache, collapsed seasons and notes along to the new id', async () => {
		const { dm, local } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		dm.updateTmdbIdentity('Movie/A', 603, 2344);
		await dm.persistCollapsedSeasons('Movie/A', new Set([2]));
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, title: 'A2' });
		expect(local.getCache('Movie/A')).toBeUndefined();
		expect(local.getCache('Movie/A2')).toMatchObject({ tmdbId: 603, collectionId: 2344 });
		expect([...dm.getCollapsedSeasonsForTitle('Movie/A2')]).toEqual([2]);
		expect([...dm.getCollapsedSeasonsForTitle('Movie/A')]).toEqual([]);
		expect(dm.getTitle('Movie/A2')).toMatchObject({ tmdbId: 603, notes: 'keep' });
	});

	it('writes a pending episode save under the new id', async () => {
		const { dm, f, notices } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		dm.scheduleEpisodeSave('Movie/A');
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, title: 'A2' });
		const moved = dm.getTitle('Movie/A2')!;
		moved.rating = 5;
		await dm.flushPendingSave();
		expect(notices).toEqual([]);
		expect(f.files.get('W/Movie/A2.md')).toContain('Rating: 5');
	});

	it('renames through a silent edit when it is saved', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		dm.updateTitleSilent({ ...dm.getTitle('Movie/A')!, title: 'A2', status: 'Watching' });
		expect(f.files.has('W/Movie/A.md')).toBe(true);
		await dm.save();
		expect(f.files.has('W/Movie/A.md')).toBe(false);
		expect(f.files.get('W/Movie/A2.md')).toContain('Status: Watching');
	});
});

describe('title writes: changed keys only', () => {
	it('leaves unknown keys, unreadable values and the key order alone', async () => {
		const { dm, f } = await setupDataManager({
			'W/Movie/A.md': '---\nmyKey: 1\nName: A\nRating: great\nType: Movie\nReview: old\n---\n\n## Notes\n',
		});
		await dm.setFavorite('Movie/A', true);
		const lines = f.files.get('W/Movie/A.md')!.split('\n');
		expect(lines.slice(0, 6)).toEqual(['---', 'myKey: 1', 'Name: A', 'Rating: great', 'Type: Movie', 'Review: old']);
		expect(lines[6]).toBe('Favorite: true');
		expect(lines[7]).toMatch(/^Date Favorited: /);
		expect(lines[8]).toBe('---');
	});

	it('removes the key of a field set back to empty', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\nReview: old\n---\n' });
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, review: '' });
		expect(f.files.get('W/Movie/A.md')).not.toContain('Review');
	});

	it('writes seasons edited by hand to the note', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: TV Show\n---\n' });
		const t = dm.getTitle('Movie/A')!;
		await dm.updateTitle({ ...t, seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }], totalEpisodes: 3 });
		expect(f.files.get('W/Movie/A.md')).toContain('Season 1: 3');
		expect(dm.getTitle('Movie/A')?.seasonsOverride).toBe(true);
	});

	it('keeps seasons that came from the cache out of the note on an unrelated edit', async () => {
		const { dm, f, local, index } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: TV Show\nTotal Episodes: 3\n---\n' });
		local.setCache('Movie/A', { seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }] });
		await index.rebuild();
		const t = dm.getTitle('Movie/A')!;
		expect(t.seasons).toHaveLength(1);
		await dm.updateTitle({ ...t, rating: 4 });
		const note = f.files.get('W/Movie/A.md')!;
		expect(note).toContain('Rating: 4');
		expect(note).not.toContain('Seasons');
	});
});

describe('title writes: nothing to write', () => {
	it('does not touch the note and takes a copy made from the stored state as the live copy', async () => {
		vi.setSystemTime(NOW);
		const { dm, f } = await setupDataManager({});
		await dm.addTitle(makeTitle({ title: 'A', dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const before = f.files.get('W/Movie/A.md')!;
		const modifies = modifyCounter(f);
		const copy = { ...dm.getTitle('Movie/A')! };
		await dm.updateTitle(copy);
		expect(f.files.get('W/Movie/A.md')).toBe(before);
		expect(await modifies()).toBe(0);
		expect(dm.getTitle('Movie/A')).toBe(copy);
	});

	it('does not take a stale copy as the live copy', async () => {
		vi.setSystemTime(NOW);
		const { dm, f } = await setupDataManager({});
		await dm.addTitle(makeTitle({ title: 'A', rating: 1, dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const copy = { ...dm.getTitle('Movie/A')! };
		f.externalWrite('W/Movie/A.md', f.files.get('W/Movie/A.md')!.replace('Rating: 1', 'Rating: 5'));
		await tick();
		dm.getTitles();
		const outside = f.files.get('W/Movie/A.md')!;
		await dm.updateTitle(copy);
		expect(f.files.get('W/Movie/A.md')).toBe(outside);
		expect(dm.getTitle('Movie/A')).not.toBe(copy);
		expect(dm.getTitle('Movie/A')?.rating).toBe(5);
	});

	it('still stores changed API data in data.json', async () => {
		const { dm, f, local } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		const modifies = modifyCounter(f);
		const t = dm.getTitle('Movie/A')!;
		t.tmdbId = 77;
		await dm.setFavorite('Movie/A', false);
		expect(f.files.get('W/Movie/A.md')).toBe(NOTE);
		expect(await modifies()).toBe(0);
		expect(local.getCache('Movie/A')?.tmdbId).toBe(77);
	});
});

describe('title writes: a note that cannot be updated', () => {
	it('writes nothing, not the body either, reports it, and keeps the stored state', async () => {
		const { dm, f, notices } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		const modifies = modifyCounter(f);
		failNextFrontmatterWrite(f);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, rating: 3, notes: 'new body' });
		expect(f.files.get('W/Movie/A.md')).toBe(NOTE);
		expect(await modifies()).toBe(0);
		expect(notices).toEqual([{ code: 'invalidYaml', file: 'A' }]);
		expect(dm.getTitle('Movie/A')).toMatchObject({ rating: 1, notes: 'keep' });
	});

	it('writes the same copy in full once the note can be updated again', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		failNextFrontmatterWrite(f);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const copy = { ...dm.getTitle('Movie/A')!, rating: 3, notes: 'new body' };
		await dm.updateTitle(copy);
		await dm.updateTitle(copy);
		const note = f.files.get('W/Movie/A.md')!;
		expect(note).toContain('Rating: 3');
		expect(note).toContain('new body');
	});
});

describe('title writes: a stale copy', () => {
	it('saved twice, neither re-sends what its first save wrote nor reverts outside changes', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\nRating: 1\n---\n\n## Notes\n' });
		const copy = { ...dm.getTitle('Movie/A')! };
		const outside = async (from: string, to: string): Promise<void> => {
			f.externalWrite('W/Movie/A.md', f.files.get('W/Movie/A.md')!.replace(from, to));
			await tick();
			dm.getTitles();
		};
		await outside('Rating: 1', 'Rating: 5');
		copy.review = 'mine';
		await dm.updateTitle(copy);
		expect(f.files.get('W/Movie/A.md')).toContain('Review: mine');
		await outside('Review: mine', 'Review: theirs');
		copy.status = 'Watching';
		await dm.updateTitle(copy);
		const note = f.files.get('W/Movie/A.md')!;
		expect(note).toContain('Rating: 5');
		expect(note).toContain('Review: theirs');
		expect(note).toContain('Status: Watching');
	});
});

describe('title writes: the notes body', () => {
	const WITH_BODY = '---\nName: A\nType: Movie\n---\n\n## Notes\n\nold\n';

	it('is left alone by a copy that did not change it, although it changed outside', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': WITH_BODY });
		const copy = { ...dm.getTitle('Movie/A')! };
		f.externalWrite('W/Movie/A.md', WITH_BODY.replace('old', 'outside'));
		await tick();
		await dm.updateTitle({ ...copy, rating: 3 });
		const note = f.files.get('W/Movie/A.md')!;
		expect(note).toContain('outside');
		expect(note).toContain('Rating: 3');
	});

	it('is overwritten by a copy that changed it, although it changed outside', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': WITH_BODY });
		const copy = { ...dm.getTitle('Movie/A')! };
		f.externalWrite('W/Movie/A.md', WITH_BODY.replace('old', 'outside'));
		await tick();
		await dm.updateTitle({ ...copy, notes: 'mine' });
		const note = f.files.get('W/Movie/A.md')!;
		expect(note).toContain('mine');
		expect(note).not.toContain('outside');
	});

	it('is written once: a second save of the same copy writes nothing', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': WITH_BODY });
		const t = dm.getTitle('Movie/A')!;
		t.notes = 'new';
		await dm.updateTitle(t);
		const written = f.files.get('W/Movie/A.md')!;
		expect(written).toContain('new');
		const modifies = modifyCounter(f);
		await tick(20);
		const settled = await modifies();
		await dm.setFavorite('Movie/A', false);
		expect(f.files.get('W/Movie/A.md')).toBe(written);
		expect(await modifies()).toBe(settled);
	});

	it('is not written again when the copy holds what the note already holds', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': WITH_BODY });
		const copy = { ...dm.getTitle('Movie/A')! };
		f.externalWrite('W/Movie/A.md', WITH_BODY.replace('old', 'same'));
		await tick();
		const modifies = modifyCounter(f);
		await dm.updateTitle({ ...copy, notes: 'same', rating: 2 });
		// the properties, not the body
		expect(await modifies()).toBe(1);
		expect(f.files.get('W/Movie/A.md')).toContain('same');
	});

	it('written by a stale copy, is not written again by that copy over a later outside change', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\nRating: 1\n---\n\n## Notes\n\nold\n' });
		const copy = { ...dm.getTitle('Movie/A')! };
		const outside = async (from: string, to: string): Promise<void> => {
			f.externalWrite('W/Movie/A.md', f.files.get('W/Movie/A.md')!.replace(from, to));
			await tick();
			dm.getTitles();
		};
		await outside('Rating: 1', 'Rating: 5');
		copy.notes = 'mine';
		await dm.updateTitle(copy);
		expect(f.files.get('W/Movie/A.md')).toContain('mine');
		await outside('mine', 'theirs');
		copy.review = 'r';
		await dm.updateTitle(copy);
		const note = f.files.get('W/Movie/A.md')!;
		expect(note).toContain('theirs');
		expect(note).not.toContain('mine');
		expect(note).toContain('Review: r');
	});

	it('follows a body changed outside for the live copy', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': WITH_BODY });
		const t = dm.getTitle('Movie/A')!;
		f.externalWrite('W/Movie/A.md', WITH_BODY.replace('old', 'outside'));
		await tick();
		expect(t.notes).toBe('outside');
		t.rating = 2;
		await dm.updateTitle(t);
		expect(f.files.get('W/Movie/A.md')).toContain('outside');
	});
});

describe('title writes: a new note', () => {
	it('leaves no title behind when the note cannot be created', async () => {
		const { dm, f } = await setupDataManager({});
		vi.spyOn(f.app.vault, 'create').mockRejectedValueOnce(new Error('disk full'));
		await expect(dm.addTitle(makeTitle({ title: 'New' }))).rejects.toThrow('disk full');
		expect(dm.getTitles()).toEqual([]);
		expect(f.files.has('W/Movie/New.md')).toBe(false);
	});

	it('writes a silent edit once on save', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': NOTE });
		const modifies = modifyCounter(f);
		dm.updateTitleSilent({ ...dm.getTitle('Movie/A')!, rating: 2 });
		expect(f.files.get('W/Movie/A.md')).toBe(NOTE);
		await dm.save();
		await dm.save();
		expect(f.files.get('W/Movie/A.md')).toContain('Rating: 2');
		expect(await modifies()).toBe(1);
	});
});
