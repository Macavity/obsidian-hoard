import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { decodeTitle, encodeTitle, splitCache } from '../src/storage/titleCodec';
import { decodeBook, encodeBook } from '../src/storage/readingCodec';
import { decodeGame, encodeGame } from '../src/storage/gameCodec';
import { getDisplayPoster } from '../src/types';
import { setupDataManager, makeTitle } from './helpers/setupDataManager';
import { setupReadingDataManager } from './helpers/setupReadingDataManager';
import { setupGames } from './helpers/setupGameDataManager';

const fmOf = (src: string | undefined): Record<string, unknown> =>
	parse(/^---\n([\s\S]*?)\n?---/.exec(src ?? '')?.[1] ?? '') as Record<string, unknown>;

describe('images are note fields (E12)', () => {
	it('title codec: poster round-trips; none is never written', () => {
		const fromNote = decodeTitle('Movie/A', { Name: 'A', Cover: 'https://mine' }, { posterUrl: 'https://cache' }).entry;
		expect(fromNote.posterUrl).toBe('https://mine');
		expect(encodeTitle(fromNote, 0).Cover).toBe('https://mine');
		expect(decodeTitle('Movie/A', { Name: 'A' }, { posterUrl: 'https://cache' }).entry.posterUrl).toBeUndefined();
		const none = decodeTitle('Movie/A', { Name: 'A' }, { posterUrl: 'none' }).entry;
		expect(none.posterUrl).toBe('none');
		expect(encodeTitle(none, 0)).not.toHaveProperty('Cover');
		expect(encodeTitle(makeTitle({ posterUrl: 'https://p' }), 0).Cover).toBe('https://p');
		expect(getDisplayPoster(fromNote)).toBe('https://mine');
	});

	it('title cache keeps only the none marker', () => {
		expect(splitCache(makeTitle({ posterUrl: 'https://p' }))).not.toHaveProperty('posterUrl');
		expect(splitCache(makeTitle({ posterUrl: 'none' })).posterUrl).toBe('none');
	});

	it('reading and game codecs: Cover is always encoded', () => {
		const book = decodeBook('Books/Dune', { Name: 'Dune' }, []).entry;
		expect(encodeBook({ ...book, coverUrl: 'https://c' }, []).Cover).toBe('https://c');
		const game = decodeGame('Games/Hades', { Name: 'Hades' }).entry;
		expect(encodeGame({ ...game, coverUrl: 'https://c' }).Cover).toBe('https://c');
		expect(game).not.toHaveProperty('coverOverride');
	});

	it('title: background fetch writes poster into an empty note field', async () => {
		const { dm, f, local } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\n---\n' });
		await dm.updatePosterUrl('Movie/A', 'https://img/p.jpg');
		expect(fmOf(f.files.get('W/Movie/A.md')).Cover).toBe('https://img/p.jpg');
		expect(local.getCache('Movie/A')?.posterUrl).toBeUndefined();
		expect(dm.getTitle('Movie/A')?.posterUrl).toBe('https://img/p.jpg');
	});

	it('title: background fetch leaves a poster in the note alone, refresh overwrites', async () => {
		const note = '---\nName: A\nType: Movie\nCover: https://mine\n---\n';
		const { dm, f } = await setupDataManager({ 'W/Movie/A.md': note });
		await dm.updatePosterUrl('Movie/A', 'https://api');
		expect(f.files.get('W/Movie/A.md')).toBe(note);
		expect(dm.getTitle('Movie/A')?.posterUrl).toBe('https://mine');
		await dm.updatePosterUrl('Movie/A', 'none');
		expect(dm.getTitle('Movie/A')?.posterUrl).toBe('https://mine');
		await dm.updatePosterUrl('Movie/A', 'https://api', true);
		expect(fmOf(f.files.get('W/Movie/A.md')).Cover).toBe('https://api');
		expect(dm.getTitle('Movie/A')?.posterUrl).toBe('https://api');
	});

	it('title: none marks only a title without poster, in the cache', async () => {
		const note = '---\nName: A\nType: Movie\n---\n';
		const { dm, f, local } = await setupDataManager({ 'W/Movie/A.md': note });
		await dm.updatePosterUrl('Movie/A', 'none');
		dm.flushPosterSave();
		expect(f.files.get('W/Movie/A.md')).toBe(note);
		expect(local.getCache('Movie/A')?.posterUrl).toBe('none');
		expect(dm.getTitle('Movie/A')?.posterUrl).toBe('none');
	});

	it('title: queues an identified title without poster', async () => {
		const { posterQueue } = await setupDataManager({
			'W/Movie/A.md': '---\nName: A\nType: Movie\nExternal ID: tmdb:movie:603\n---\n',
		});
		expect(posterQueue).toEqual(['Movie/A']);
	});

	it('reading: lazy cover fetch fills an empty coverUrl only', async () => {
		const { rdm, f } = await setupReadingDataManager({
			'W/Books/Dune.md': '---\nName: Dune\nStatus: Reading\nType: book\n---\n',
			'W/Books/Emma.md': '---\nName: Emma\nStatus: Reading\nType: book\nCover: https://mine\n---\n',
		});
		await rdm.updateCoverUrl('book', 'Books/Dune', 'https://cover');
		await rdm.updateCoverUrl('book', 'Books/Emma', 'https://cover');
		expect(fmOf(f.files.get('W/Books/Dune.md')).Cover).toBe('https://cover');
		expect(fmOf(f.files.get('W/Books/Emma.md')).Cover).toBe('https://mine');
		expect(rdm.getBook('Books/Dune')?.coverUrl).toBe('https://cover');
		expect(rdm.getBook('Books/Emma')?.coverUrl).toBe('https://mine');
	});

	it('reading: an explicit update overwrites', async () => {
		const { rdm, f } = await setupReadingDataManager({
			'W/Books/Dune.md': '---\nName: Dune\nStatus: Reading\nType: book\nCover: https://old\n---\n',
		});
		const dune = rdm.getBook('Books/Dune')!;
		await rdm.updateBook({ ...dune, coverUrl: 'https://new' });
		expect(fmOf(f.files.get('W/Books/Dune.md')).Cover).toBe('https://new');
	});

	it('games: lazy cover fetch fills an empty coverUrl only', async () => {
		const { gdm, f } = await setupGames({
			'W/Games/Hades.md': '---\nName: Hades\nStatus: Playing\nType: game\n---\n',
			'W/Games/Celeste.md': '---\nName: Celeste\nStatus: Playing\nCover: https://mine\nType: game\n---\n',
		});
		await gdm.updateCoverUrl('Games/Hades', 'https://cover');
		await gdm.updateCoverUrl('Games/Celeste', 'https://cover');
		expect(fmOf(f.files.get('W/Games/Hades.md')).Cover).toBe('https://cover');
		expect(fmOf(f.files.get('W/Games/Celeste.md')).Cover).toBe('https://mine');
	});

	it('adding a title, book or game writes its image into the note', async () => {
		const { dm, f } = await setupDataManager({});
		await dm.addTitle(makeTitle({ title: 'A', type: 'Movie', posterUrl: 'https://p' }));
		expect(fmOf(f.files.get('W/Movie/A.md')).Cover).toBe('https://p');
		const r = await setupReadingDataManager({});
		const book = { ...decodeBook('Books/Dune', { Name: 'Dune' }, []).entry, id: r.rdm.generateBookId('Dune'), coverUrl: 'https://c' };
		await r.rdm.addBook(book);
		expect(fmOf(r.f.files.get('W/Books/Dune.md')).Cover).toBe('https://c');
	});

});
