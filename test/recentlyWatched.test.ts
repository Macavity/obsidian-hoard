import { describe, it, expect } from 'vitest';
import { createFakeApp } from './fakes/fakeApp';
import { VaultLayout } from '../src/storage/VaultLayout';
import { HistoryStore } from '../src/storage/HistoryStore';
import { resolveRecentlyWatched, type HistoryEntry } from '../src/HistoryManager';

const t = (id: string, title: string, type = 'TV Show') => ({ id, title, type });
let n = 0;
const e = (extra: Partial<HistoryEntry>): HistoryEntry => ({
	id: `e${n++}`, timestamp: '2026-01-01T00:00:00.000Z', message: '', source: 'Watchlist', action: 'watched', ...extra,
});

describe('resolveRecentlyWatched', () => {
	const alien = t('TV Show/Alien- Covenant', 'Alien: Covenant');
	const dark = t('TV Show/Dark', 'Dark');
	const dune = t('Movie/Dune', 'Dune', 'Movie');

	it('matches by exact titleId even when the file name differs from the title', () => {
		const out = resolveRecentlyWatched([e({ titleId: alien.id, titleName: 'Alien- Covenant' })], [dark, alien]);
		expect(out).toEqual([alien]);
	});

	it('matches a link Obsidian shortened to the basename', () => {
		const out = resolveRecentlyWatched([e({ titleId: 'Alien- Covenant', titleName: 'Alien- Covenant' })], [dark, alien]);
		expect(out).toEqual([alien]);
	});

	it('falls back to the name for entries without an id', () => {
		const out = resolveRecentlyWatched([e({ titleName: 'Dune' }), e({ message: 'Dark (TV Show) episode 1 watched', action: undefined })], [dark, dune]);
		expect(out).toEqual([dune, dark]);
	});

	it('skips deleted titles, other sources and non-watch actions', () => {
		const out = resolveRecentlyWatched([
			e({ titleId: 'TV Show/Gone', titleName: 'Gone' }),
			e({ titleId: dark.id, source: 'Reading' }),
			e({ titleId: dark.id, action: 'rating' }),
			e({ titleId: dune.id, action: 'completed' }),
		], [dark, dune]);
		expect(out).toEqual([dune]);
	});

	it('keeps the input order (most recent first), without duplicates, capped at the limit', () => {
		const out = resolveRecentlyWatched([
			e({ titleId: dune.id }), e({ titleId: alien.id }), e({ titleId: dune.id }), e({ titleId: dark.id }),
		], [dark, alien, dune], 2);
		expect(out).toEqual([dune, alien]);
	});

	it('resolves an entry read back from History.md with a sanitised file name', async () => {
		const f = createFakeApp({
			'W/History.md': '# History\n\n- 2026-01-01T00:00:00.000Z · watched · [[TV Show/Alien- Covenant]] · Alien: Covenant (TV Show) S1E1 watched #watchlist\n',
		});
		const entries = (await new HistoryStore(f.app, () => new VaultLayout('W', () => [])).load()).reverse();
		expect(resolveRecentlyWatched(entries, [dark, alien])).toEqual([alien]);
	});
});
