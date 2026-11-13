import { describe, it, expect } from 'vitest';
import { parseHistoryLine, formatHistoryLine } from '../../src/storage/historyLine';

describe('historyLine', () => {
	it('round-trips a linked entry', () => {
		const l = '- 2026-10-17T11:02:10Z · watched · [[TV Show/Dark]] · S01E03 #watchlist';
		expect(formatHistoryLine(parseHistoryLine(l)!)).toBe(l);
	});

	it('round-trips a plain target', () => {
		const l = '- 2026-10-17T11:05:00Z · group-created · Marvel';
		expect(parseHistoryLine(l)).toMatchObject({ action: 'group-created', target: 'Marvel', isLink: false });
		expect(formatHistoryLine(parseHistoryLine(l)!)).toBe(l);
	});

	it('keeps titles with special chars', () => {
		const l = '- 2026-10-17T10:00:00Z · added · [[Movie/Léon: The Professional]]';
		expect(parseHistoryLine(l)?.target).toBe('Movie/Léon: The Professional');
	});

	it('rejects garbage', () => {
		expect(parseHistoryLine('random text')).toBeNull();
		expect(parseHistoryLine('- not-a-date · added · x')).toBeNull();
	});
});

describe('history store lines', () => {
  it('keeps a multi-line name on one line', async () => {
    const { historyKey } = await import('../../src/storage/HistoryStore');
    const key = historyKey({ timestamp: '2026-10-17T10:00:00Z', action: 'added', titleName: 'Evil\n- 2026-01-01T00:00:00Z · deleted · X', message: '', source: 'Watchlist' } as never);
    expect(key).toBe('2026-10-17T10:00:00Z|added|Evil - 2026-01-01T00:00:00Z · deleted · X');
  });
});

describe('parseHistoryLine fields', () => {
	const T = '2026-10-17T11:02:10Z';
	const base = { timestamp: T, action: 'added', target: 'A', isLink: true };

	it('reads a link target with message and source', () => {
		expect(parseHistoryLine(`- ${T} · watched · [[TV Show/Dark]] · S01E03 #watchlist`)).toStrictEqual({
			timestamp: T, action: 'watched', target: 'TV Show/Dark', isLink: true, source: 'Watchlist', message: 'S01E03',
		});
	});

	it('leaves message and source out when the line has none', () => {
		expect(parseHistoryLine(`- ${T} · added · [[A]]`)).toStrictEqual(base);
		expect(parseHistoryLine(`- ${T} · added · [[A]] · `)).toStrictEqual(base);
		expect(parseHistoryLine(`- ${T} · added · Dune`)).toStrictEqual({ ...base, target: 'Dune', isLink: false });
	});

	it('reads a source without a message and a message without a source', () => {
		expect(parseHistoryLine(`- ${T} · added · [[A]] · #reading`)).toStrictEqual({ ...base, source: 'Reading' });
		expect(parseHistoryLine(`- ${T} · added · [[A]] · hello`)).toStrictEqual({ ...base, message: 'hello' });
		expect(parseHistoryLine(`- ${T} · added · Dune · #games`)).toStrictEqual({ ...base, target: 'Dune', isLink: false, source: 'Games' });
	});

	it('keeps a separator inside the message', () => {
		expect(parseHistoryLine(`- ${T} · rating · [[A]] · 4 · was 3 #games`)).toStrictEqual({
			...base, action: 'rating', source: 'Games', message: '4 · was 3',
		});
		expect(parseHistoryLine(`- ${T} · rating · Dune · 4 · was 3`)).toStrictEqual({
			...base, action: 'rating', target: 'Dune', isLink: false, message: '4 · was 3',
		});
	});

	it('takes a source tag only as the last word', () => {
		expect(parseHistoryLine(`- ${T} · added · [[A]] · note #other`)).toStrictEqual({ ...base, message: 'note #other' });
		expect(parseHistoryLine(`- ${T} · added · [[A]] · see #games here`)).toStrictEqual({ ...base, message: 'see #games here' });
		expect(parseHistoryLine(`- ${T} · added · [[A]] · x#games`)).toStrictEqual({ ...base, message: 'x#games' });
		expect(parseHistoryLine(`- ${T} · added · [[A]] · #Games`)).toStrictEqual({ ...base, message: '#Games' });
	});

	it('keeps a tag glued to a plain target as part of the target', () => {
		expect(parseHistoryLine(`- ${T} · added · Dune #games`)).toStrictEqual({ ...base, target: 'Dune #games', isLink: false });
	});

	it('rejects a link that is followed by text without a separator', () => {
		expect(parseHistoryLine(`- ${T} · added · [[A]]x`)).toBeNull();
		expect(parseHistoryLine(`- ${T} · added · [[A]] x`)).toBeNull();
	});

	it('rejects a line without a target or without an action field', () => {
		expect(parseHistoryLine(`- ${T} · added · `)).toBeNull();
		expect(parseHistoryLine(`- ${T} · added`)).toBeNull();
		expect(parseHistoryLine(`- ${T}`)).toBeNull();
		expect(parseHistoryLine(`${T} · added · [[A]]`)).toBeNull();
	});

	it.each(['added', 'completed', 'deleted', 'status', 'rating', 'watched', 'group-created'])('accepts the action %s', (action) => {
		expect(parseHistoryLine(`- ${T} · ${action} · [[A]]`)).toStrictEqual({ ...base, action });
	});

	it('rejects an unknown action', () => {
		expect(parseHistoryLine(`- ${T} · renamed · [[A]]`)).toBeNull();
		expect(parseHistoryLine(`- ${T} · Added · [[A]]`)).toBeNull();
	});

	it('accepts UTC timestamps with or without fractions and rejects everything else', () => {
		expect(parseHistoryLine('- 2026-01-01T00:00:00.123Z · added · [[A]]')).toStrictEqual({ ...base, timestamp: '2026-01-01T00:00:00.123Z' });
		expect(parseHistoryLine('- 2026-13-40T00:00:00Z · added · [[A]]')).toBeNull();
		expect(parseHistoryLine('- 2026-01-01T00:00:00 · added · [[A]]')).toBeNull();
		expect(parseHistoryLine('- 2026-01-01 · added · [[A]]')).toBeNull();
	});
});

describe('formatHistoryLine', () => {
	const T = '2026-10-17T11:02:10Z';

	it('writes message and source as one trailing field', () => {
		expect(formatHistoryLine({ timestamp: T, action: 'rating', target: 'A', isLink: true, message: '4', source: 'Games' }))
			.toBe(`- ${T} · rating · [[A]] · 4 #games`);
		expect(formatHistoryLine({ timestamp: T, action: 'added', target: 'Dune', isLink: false, source: 'Reading' }))
			.toBe(`- ${T} · added · Dune · #reading`);
		expect(formatHistoryLine({ timestamp: T, action: 'added', target: 'Dune', isLink: false })).toBe(`- ${T} · added · Dune`);
	});
});
