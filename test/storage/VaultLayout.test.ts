import { describe, it, expect } from 'vitest';
import { VaultLayout, safeTypeName, typeNameProblem } from '../../src/storage/VaultLayout';
const l = new VaultLayout('Journal/Hoard', () => ['Movie', 'TV Show']);
describe('VaultLayout', () => {
  it('classifies entries', () => {
    expect(l.classify('Journal/Hoard/Movie/Hocus Pocus.md')).toEqual({ kind: 'title', id: 'Movie/Hocus Pocus', type: 'Movie' });
    expect(l.classify('Journal/Hoard/Books/Dune.md')).toEqual({ kind: 'book', id: 'Books/Dune' });
    expect(l.classify('Journal/Hoard/Games/Hades.md')?.kind).toBe('game');
  });
  it('ignores non-entries', () => {
    for (const p of ['Journal/Hoard/Hoard.base', 'Journal/Hoard/History.md', 'Journal/Hoard/CustomLists/Top.md',
      'Journal/Hoard/Movie/sub/X.md', 'Journal/Hoard/Movie/x.png', 'Journal/Hoard/Unknown/X.md', 'Other/Movie/X.md'])
      expect(l.classify(p)).toBeNull();
  });
  it('maps ids and paths', () => {
    expect(l.pathFromId('Movie/Hocus Pocus')).toBe('Journal/Hoard/Movie/Hocus Pocus.md');
    expect(l.idFromPath('Journal/Hoard/Movie/Hocus Pocus.md')).toBe('Movie/Hocus Pocus');
    expect(l.notePath('title', 'Léon: The Professional', 'Movie')).toBe('Journal/Hoard/Movie/Léon- The Professional.md');
    expect(l.notePath('manga', ' Berserk? ')).toBe('Journal/Hoard/Manga/Berserk-.md');
  });
  it('finds the first hoard base', () => {
    expect(VaultLayout.findRoot([{ path: 'b/Hoard.base', hasHoardKey: true }, { path: 'a/X.base', hasHoardKey: false },
      { path: 'a/Hoard.base', hasHoardKey: true }])).toBe('a');
    expect(VaultLayout.findRoot([])).toBeNull();
  });
});

describe('safe names', () => {
  it('hides no notes behind dot-files or Windows device names', () => {
    expect(l.notePath('title', '...And Justice for All', 'Movie')).toBe('Journal/Hoard/Movie/---And Justice for All.md');
    expect(l.notePath('game', 'Nul')).toBe('Journal/Hoard/Games/Nul-.md');
    expect(l.notePath('title', 'Normal', 'Movie')).toBe('Journal/Hoard/Movie/Normal.md');
  });
  it('keeps type names usable as folders', () => {
    expect(safeTypeName('Sci-Fi/Fantasy')).toBe('Sci-Fi-Fantasy');
    expect(safeTypeName('Books')).toBe('Books (type)');
    expect(safeTypeName(' Anime ')).toBe('Anime');
  });
  it('reports type name problems as codes', () => {
    expect(typeNameProblem('Anime')).toBeNull();
    expect(typeNameProblem('Sci-Fi/Fantasy')).toEqual({ reason: 'unsafe', name: 'Sci-Fi/Fantasy', safe: 'Sci-Fi-Fantasy' });
    expect(typeNameProblem(' Sci-Fi/Fantasy ')).toEqual({ reason: 'unsafe', name: 'Sci-Fi/Fantasy', safe: 'Sci-Fi-Fantasy' });
    expect(typeNameProblem('games')).toEqual({ reason: 'reserved', name: 'games' });
    expect(typeNameProblem('Books')).toEqual({ reason: 'reserved', name: 'Books' });
  });
});
