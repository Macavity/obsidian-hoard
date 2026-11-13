import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupGames, makeGame } from './helpers/setupGameDataManager';
import { tick } from './helpers/common';

const NOW = new Date('2026-03-04T05:06:07.000Z');
const GAME = '---\nName: A\nType: game\nRating: 1\n---\n\n## Notes\n\nkeep\n';

type Setup = Awaited<ReturnType<typeof setupGames>>;

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

describe('game writes: rename', () => {
	it('moves the note and writes a field changed in the same edit to it', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': GAME });
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, title: 'A2', rating: 4 });
		expect(f.files.has('W/Games/A.md')).toBe(false);
		const moved = f.files.get('W/Games/A2.md')!;
		expect(moved).toContain('Name: A2');
		expect(moved).toContain('Rating: 4');
		expect(moved).toContain('keep');
		expect(gdm.getGame('Games/A')).toBeUndefined();
		expect(gdm.getGame('Games/A2')).toMatchObject({ title: 'A2', rating: 4, vaultPage: 'W/Games/A2.md' });
		expect(gdm.getGames()).toHaveLength(1);
	});

	it('keeps the name when a note is already at the target, and still writes the new title', async () => {
		const other = '---\nName: B\nType: game\n---\n';
		const { gdm, f, notices } = await setupGames({ 'W/Games/A.md': GAME, 'W/Games/B.md': other });
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, title: 'B' });
		expect(f.files.get('W/Games/A.md')).toContain('Name: B');
		expect(f.files.get('W/Games/B.md')).toBe(other);
		expect(notices).toEqual([{ code: 'renameTargetExists', target: 'W/Games/B.md' }]);
		expect(gdm.getGame('Games/A')?.title).toBe('B');
	});

	it('renames through a silent edit when it is saved', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': GAME });
		gdm.updateGameSilent({ ...gdm.getGame('Games/A')!, title: 'A2', rating: 2 });
		expect(f.files.has('W/Games/A.md')).toBe(true);
		await gdm.saveAndNotify();
		expect(f.files.has('W/Games/A.md')).toBe(false);
		expect(f.files.get('W/Games/A2.md')).toContain('Rating: 2');
	});

	it('moves a pending id along: the flush after a rename reports no lost edit', async () => {
		const { gdm, f, notices } = await setupGames({ 'W/Games/A.md': GAME });
		const g = gdm.getGame('Games/A')!;
		gdm.updateGameSilent({ ...g, rating: 5 });
		const renamed = { ...g, title: 'A2' };
		await gdm.updateGame(renamed);
		await gdm.saveAndNotify();
		expect(notices).toEqual([]);
		// as today: updateGame takes the id out of the pending set, so the earlier silent rating is gone
		expect(f.files.get('W/Games/A2.md')).toContain('Rating: 1');
	});
});

describe('game writes: changed keys only', () => {
	it('leaves unknown keys, unreadable values and the key order alone', async () => {
		const { gdm, f } = await setupGames({
			'W/Games/A.md': '---\nmyKey: 1\nName: A\nPlaytime: lots\nType: game\nDeveloper: old\n---\n',
		});
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, rating: 4 });
		const lines = f.files.get('W/Games/A.md')!.split('\n');
		expect(lines.slice(0, 6)).toEqual(['---', 'myKey: 1', 'Name: A', 'Playtime: lots', 'Type: game', 'Developer: old']);
		expect(lines).toContain('Rating: 4');
	});

	it('removes the keys of a favorite switched off', async () => {
		const { gdm, f } = await setupGames({
			'W/Games/A.md': '---\nName: A\nType: game\nFavorite: true\nDate Favorited: 2026-01-01T00:00:00.000Z\n---\n',
		});
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, favorite: false });
		const note = f.files.get('W/Games/A.md')!;
		expect(note).not.toContain('Favorite');
		expect(note).toContain('Name: A');
	});

	it('writes an emptied text field as an empty value, not as a missing key', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': '---\nName: A\nType: game\nDeveloper: old\n---\n' });
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, developer: '' });
		expect(f.files.get('W/Games/A.md')).toContain('Developer: ""');
	});

	it('does not write the substituted default status back on an unrelated edit', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': '---\nName: A\nType: game\n---\n' });
		const g = gdm.getGame('Games/A')!;
		expect(g.status).toBe('Not started');
		await gdm.updateGame({ ...g, rating: 3 });
		const note = f.files.get('W/Games/A.md')!;
		expect(note).toContain('Rating: 3');
		expect(note).not.toContain('Status');
	});
});

describe('game writes: the live copy', () => {
	it('stays the live copy over several saves', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': GAME });
		const g = gdm.getGame('Games/A')!;
		g.rating = 2;
		await gdm.updateGame(g);
		expect(gdm.getGame('Games/A')).toBe(g);
		g.rating = 3;
		await gdm.updateGame(g);
		await tick();
		expect(gdm.getGame('Games/A')).toBe(g);
		expect(f.files.get('W/Games/A.md')).toContain('Rating: 3');
	});
});

describe('game writes: nothing to write', () => {
	it('does not touch the note and takes a copy made from the stored state as the live copy', async () => {
		vi.setSystemTime(NOW);
		const { gdm, f } = await setupGames({});
		await gdm.addGame(makeGame({ title: 'A', dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const before = f.files.get('W/Games/A.md')!;
		const modifies = modifyCounter(f);
		const copy = { ...gdm.getGame('Games/A')! };
		await gdm.updateGame(copy);
		expect(f.files.get('W/Games/A.md')).toBe(before);
		expect(await modifies()).toBe(0);
		expect(gdm.getGame('Games/A')).toBe(copy);
	});

	it('does not take a stale copy as the live copy', async () => {
		vi.setSystemTime(NOW);
		const { gdm, f } = await setupGames({});
		await gdm.addGame(makeGame({ title: 'A', rating: 1, dateAdded: NOW.toISOString(), dateModified: NOW.toISOString() }));
		const copy = { ...gdm.getGame('Games/A')! };
		f.externalWrite('W/Games/A.md', f.files.get('W/Games/A.md')!.replace('Rating: 1', 'Rating: 5'));
		await tick();
		gdm.getGames();
		const outside = f.files.get('W/Games/A.md')!;
		await gdm.updateGame(copy);
		expect(f.files.get('W/Games/A.md')).toBe(outside);
		expect(gdm.getGame('Games/A')).not.toBe(copy);
		expect(gdm.getGame('Games/A')?.rating).toBe(5);
	});
});

describe('game writes: a note that cannot be updated', () => {
	it('writes nothing, reports it, and keeps the stored state', async () => {
		const { gdm, f, notices } = await setupGames({ 'W/Games/A.md': GAME });
		const modifies = modifyCounter(f);
		failNextFrontmatterWrite(f);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, rating: 3 });
		expect(f.files.get('W/Games/A.md')).toBe(GAME);
		expect(await modifies()).toBe(0);
		expect(notices).toEqual([{ code: 'invalidYaml', file: 'A' }]);
		expect(gdm.getGame('Games/A')?.rating).toBe(1);
	});

	it('writes the same copy in full once the note can be updated again', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': GAME });
		failNextFrontmatterWrite(f);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const copy = { ...gdm.getGame('Games/A')!, rating: 3 };
		await gdm.updateGame(copy);
		await gdm.updateGame(copy);
		expect(f.files.get('W/Games/A.md')).toContain('Rating: 3');
	});
});

describe('game writes: a stale copy', () => {
	it('saved twice, neither re-sends what its first save wrote nor reverts outside changes', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': '---\nName: A\nType: game\nRating: 1\n---\n' });
		const copy = { ...gdm.getGame('Games/A')! };
		const outside = async (from: string, to: string): Promise<void> => {
			f.externalWrite('W/Games/A.md', f.files.get('W/Games/A.md')!.replace(from, to));
			await tick();
			gdm.getGames();
		};
		await outside('Rating: 1', 'Rating: 5');
		copy.developer = 'mine';
		await gdm.updateGame(copy);
		expect(f.files.get('W/Games/A.md')).toContain('Developer: mine');
		await outside('Developer: mine', 'Developer: theirs');
		copy.publisher = 'P';
		await gdm.updateGame(copy);
		const note = f.files.get('W/Games/A.md')!;
		expect(note).toContain('Rating: 5');
		expect(note).toContain('Developer: theirs');
		expect(note).toContain('Publisher: P');
	});
});

describe('game writes: a new note', () => {
	it('leaves no game behind when the note cannot be created', async () => {
		const { gdm, f } = await setupGames({});
		vi.spyOn(f.app.vault, 'create').mockRejectedValueOnce(new Error('disk full'));
		await expect(gdm.addGame(makeGame({ title: 'New' }))).rejects.toThrow('disk full');
		expect(gdm.getGames()).toEqual([]);
		expect(f.files.has('W/Games/New.md')).toBe(false);
	});

	it('writes a silent edit once', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': GAME });
		const modifies = modifyCounter(f);
		gdm.updateGameSilent({ ...gdm.getGame('Games/A')!, rating: 2 });
		expect(f.files.get('W/Games/A.md')).toBe(GAME);
		await gdm.saveAndNotify();
		await gdm.saveAndNotify();
		expect(f.files.get('W/Games/A.md')).toContain('Rating: 2');
		expect(await modifies()).toBe(1);
	});
});
