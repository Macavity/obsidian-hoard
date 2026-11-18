import { describe, it, expect } from 'vitest';
import { setupDataManager, makeTitle } from './helpers/setupDataManager';
import { setupGames } from './helpers/setupGameDataManager';
import { setupReadingDataManager } from './helpers/setupReadingDataManager';
import { decodeGame } from '../src/shared/storage/gameCodec';
import { decodeBook } from '../src/shared/storage/readingCodec';

const FAV = 'Favorite: true\nDate Favorited: 2026-01-01T00:00:00.000Z\n';

describe('optional keys are absent, not undefined', () => {
	it('un-favoriting a title removes dateFavorited', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': `---\nName: A\nType: Movie\n${FAV}---\n` });
		await dm.setFavorite('Movie/A', false);
		expect('dateFavorited' in dm.getTitle('Movie/A')!).toBe(false);
		expect(f.files.get('W/Movie/A.md')).not.toContain('Date Favorited');
	});

	it('un-favoriting a book removes dateFavorited', async () => {
		const { rdm, f } = await setupReadingDataManager({ 'W/Books/A.md': `---\nName: A\nType: book\n${FAV}---\n` });
		await rdm.setFavorite('book', 'Books/A', false);
		expect('dateFavorited' in rdm.getBook('Books/A')!).toBe(false);
		expect(f.files.get('W/Books/A.md')).not.toContain('Date Favorited');
	});

	it('un-favoriting a game removes dateFavorited', async () => {
		const { gdm, f } = await setupGames({ 'W/Games/A.md': `---\nName: A\nType: game\n${FAV}---\n` });
		await gdm.updateGame({ ...gdm.getGame('Games/A')!, favorite: false });
		expect('dateFavorited' in gdm.getGame('Games/A')!).toBe(false);
		expect(f.files.get('W/Games/A.md')).not.toContain('Date Favorited');
	});

	it('adopting a Maybe leaves no maybe key', async () => {
		const { dm } = await setupDataManager({ 'W/Movie/B.md': '---\nName: B\nType: Movie\nMaybe: true\n---\n' });
		await dm.addTitle(makeTitle({ title: 'B', type: 'Movie', status: 'Watching' }));
		expect('maybe' in dm.getTitle('Movie/B')!).toBe(false);
	});

	it('emptying a title\'s groups removes the groups key', async () => {
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\nGroups: ["G"]\n---\n' });
		await dm.removeGroup('G');
		expect('groups' in dm.getTitle('Movie/A')!).toBe(false);
		expect(f.files.get('W/Movie/A.md')).not.toContain('Groups');
	});

	it('clearing a title\'s airtime removes the airtime key', async () => {
		const { dm } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\nAirtime Recurrence: weekly\nAirtime Day: 3\n---\n' });
		expect(dm.getTitle('Movie/A')!.airtime).toBeDefined();
		await dm.removeAirtimeEntriesForTitle('Movie/A');
		expect('airtime' in dm.getTitle('Movie/A')!).toBe(false);
	});

	it('decoded entries without groups, airtime or favorite stamp have no such keys', () => {
		const game = decodeGame('Games/A', { Name: 'A' }).entry;
		for (const k of ['groups', 'airtime', 'dateFavorited']) expect(k in game).toBe(false);
		const book = decodeBook('Books/A', { Name: 'A' }, []).entry;
		for (const k of ['groups', 'airtime', 'dateFavorited', 'favorite', 'externalLink']) expect(k in book).toBe(false);
	});
});
