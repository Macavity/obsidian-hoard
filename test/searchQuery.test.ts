import { describe, expect, it } from 'vitest';
import { searchItems, yearOf } from '../src/SearchQuery';
import { FILMS, FILM_SEARCH } from './searchQuery.fixture';

/** Sorted ids the query matches, or null when the query counts as "no search". */
const ids = (query: string): string[] | null => {
	const hit = searchItems(FILMS, FILM_SEARCH, query);
	return hit === null ? null : [...hit].sort();
};

const EVERYTHING = ['arrival', 'avengers', 'blade', 'dune', 'passengers', 'rezero'];

describe('searchItems: no search', () => {
	it.each(['', '   ', '|', '| |', '""', '-""', 'title:""'])('%j is no search', (query) => {
		expect(ids(query)).toBeNull();
	});
});

describe('searchItems: bare words', () => {
	it('matches regardless of case', () => {
		expect(ids('dune')).toEqual(['dune']);
		expect(ids('DUNE')).toEqual(['dune']);
	});

	it('forgives one edit in a long word and none in a short one', () => {
		expect(ids('avengrs')).toEqual(['avengers']);
		expect(ids('dnue')).toEqual([]);
		expect(ids('duen')).toEqual([]);
	});

	it('keeps two-edit neighbours apart', () => {
		expect(ids('avengers')).toEqual(['avengers']);
		expect(ids('passengers')).toEqual(['passengers']);
		// one edit from each of the two titles
		expect(ids('pasengers')).toEqual(['avengers', 'passengers']);
	});

	it('searches every text field', () => {
		expect(ids('legendary')).toEqual(['arrival', 'dune']);
		expect(ids('chris')).toEqual(['avengers', 'passengers']);
		expect(ids('2049')).toEqual(['blade']);
		expect(ids('2016')).toEqual(['arrival', 'passengers']);
	});

	it('ANDs words across fields of one item', () => {
		expect(ids('chris marvel')).toEqual(['avengers']);
		expect(ids('chris columbia')).toEqual(['passengers']);
		expect(ids('chris legendary')).toEqual([]);
	});

	it('treats stray punctuation as text', () => {
		expect(ids('-')).toEqual([]);
		expect(ids('title:')).toEqual([]);
		expect(ids('"unterminated')).toEqual([]);
		expect(ids('a"b"')).toEqual([]);
	});
});

describe('searchItems: quoted phrases', () => {
	it('matches an exact substring, ignoring case', () => {
		expect(ids('"chris"')).toEqual(['avengers', 'passengers']);
		expect(ids('"CHRIS e"')).toEqual(['avengers']);
		expect(ids('"runner 2049"')).toEqual(['blade']);
	});

	it('reads a quoted number as text, not as a comparison', () => {
		expect(ids('"2016"')).toEqual(['arrival', 'passengers']);
		expect(ids('year:"2016"')).toEqual(['arrival', 'passengers']);
		expect(ids('year:"201"')).toEqual(['arrival', 'avengers', 'blade', 'passengers']);
	});

	it('keeps a pipe and a colon inside quotes', () => {
		expect(ids('"rie|taka"')).toEqual(['rezero']);
		expect(ids('"re:zero"')).toEqual(['rezero']);
	});
});

describe('searchItems: field scope', () => {
	it('restricts a word to the named field', () => {
		expect(ids('cast:chris')).toEqual(['avengers', 'passengers']);
		expect(ids('title:chris')).toEqual([]);
		expect(ids('title:legendary')).toEqual([]);
		expect(ids('title:dune')).toEqual(['dune']);
	});

	it('restricts a phrase to the named field', () => {
		expect(ids('studio:"legend"')).toEqual(['arrival', 'dune']);
		expect(ids('cast:"legend"')).toEqual([]);
	});

	it('accepts aliases and any case in the prefix', () => {
		expect(ids('dev:legendary')).toEqual(['arrival', 'dune']);
		expect(ids('studio:legendary')).toEqual(['arrival', 'dune']);
		expect(ids('TITLE:dune')).toEqual(['dune']);
	});

	it('searches an unknown prefix as part of the text', () => {
		expect(ids('Re:Zero')).toEqual(['rezero']);
		expect(ids('re:zero')).toEqual(['rezero']);
		expect(ids('foo:dune')).toEqual([]);
	});

	it('finds nothing for a word on a field that has no text', () => {
		expect(ids('rating:abc')).toEqual([]);
	});
});

describe('searchItems: numeric comparison', () => {
	it('compares with each operator', () => {
		expect(ids('year:>2016')).toEqual(['blade', 'dune']);
		expect(ids('year:>=2016')).toEqual(['arrival', 'blade', 'dune', 'passengers']);
		expect(ids('year:<2016')).toEqual(['avengers']);
		expect(ids('year:<=2016')).toEqual(['arrival', 'avengers', 'passengers']);
		expect(ids('year:=2016')).toEqual(['arrival', 'passengers']);
	});

	it('reads a bare number on a numeric field as equality, not as a prefix', () => {
		expect(ids('year:2016')).toEqual(['arrival', 'passengers']);
		expect(ids('year:201')).toEqual([]);
	});

	it('handles decimals and negative values', () => {
		expect(ids('rating:>=4.5')).toEqual(['dune']);
		expect(ids('rating:4')).toEqual(['avengers', 'blade']);
		expect(ids('rating:<0')).toEqual(['arrival']);
		expect(ids('rating:-1')).toEqual(['arrival']);
		expect(ids('rating:>-2')).toEqual(['arrival', 'avengers', 'blade', 'dune', 'passengers']);
	});

	it('never matches an item whose number is missing', () => {
		expect(ids('year:>0')).toEqual(['arrival', 'avengers', 'blade', 'dune', 'passengers']);
		expect(ids('year:<9999')).toEqual(['arrival', 'avengers', 'blade', 'dune', 'passengers']);
	});

	it('searches text when the field has no number', () => {
		expect(ids('title:2049')).toEqual(['blade']);
		expect(ids('title:>2000')).toEqual([]);
	});

	it('searches text when no field is named', () => {
		// ">2016" is one edit from "2016"
		expect(ids('>2016')).toEqual(['arrival', 'passengers']);
	});

	it('does not join an operator and a number across a space', () => {
		expect(ids('year:> 2016')).toEqual([]);
	});
});

describe('searchItems: alternatives', () => {
	it('matches either side of a pipe, spaced or not', () => {
		expect(ids('dune | arrival')).toEqual(['arrival', 'dune']);
		expect(ids('dune|arrival')).toEqual(['arrival', 'dune']);
		expect(ids('kobayashi|zendaya')).toEqual(['dune', 'rezero']);
		expect(ids('dune | arrival | passengers')).toEqual(['arrival', 'dune', 'passengers']);
	});

	it('ignores a pipe with nothing to join', () => {
		expect(ids('| dune')).toEqual(['dune']);
		expect(ids('dune |')).toEqual(['dune']);
		expect(ids('dune | | arrival')).toEqual(['arrival', 'dune']);
	});

	it('ANDs a group of alternatives with the words around it', () => {
		expect(ids('legendary dune | arrival')).toEqual(['arrival', 'dune']);
		expect(ids('dune | arrival legendary')).toEqual(['arrival', 'dune']);
		expect(ids('chris | legendary year:2016')).toEqual(['arrival', 'passengers']);
		expect(ids('chris | legendary year:>2016')).toEqual(['dune']);
	});
});

describe('searchItems: exclusion', () => {
	it('starts from every item when the query only excludes', () => {
		expect(ids('-dune')).toEqual(['arrival', 'avengers', 'blade', 'passengers', 'rezero']);
		expect(ids('-legendary')).toEqual(['avengers', 'blade', 'passengers', 'rezero']);
		expect(ids('-dune -arrival')).toEqual(['avengers', 'blade', 'passengers', 'rezero']);
		expect(ids('-zzzzqq')).toEqual(EVERYTHING);
	});

	it('excludes by field, phrase and comparison', () => {
		expect(ids('-title:dune')).toEqual(['arrival', 'avengers', 'blade', 'passengers', 'rezero']);
		expect(ids('-"chris"')).toEqual(['arrival', 'blade', 'dune', 'rezero']);
		expect(ids('-year:>2015')).toEqual(['avengers', 'rezero']);
		expect(ids('-rating:>=4')).toEqual(['arrival', 'passengers', 'rezero']);
	});

	it('subtracts from what the other words matched', () => {
		expect(ids('legendary -dune')).toEqual(['arrival']);
		expect(ids('chris -title:avengers')).toEqual(['passengers']);
	});

	it('stays empty when the words match nothing, whatever is excluded', () => {
		expect(ids('zzzzqq -dune')).toEqual([]);
	});

	it('does not let an exclusion join a group of alternatives', () => {
		expect(ids('dune | -arrival')).toEqual(['dune']);
		expect(ids('-dune | arrival')).toEqual(['arrival']);
		expect(ids('dune | -arrival | passengers')).toEqual(['dune', 'passengers']);
	});
});

describe('yearOf', () => {
	it('reads the year from an ISO date or a bare year', () => {
		expect(yearOf('2021-10-22')).toBe(2021);
		expect(yearOf('2021')).toBe(2021);
	});

	it('is null without a usable year', () => {
		expect(yearOf(null)).toBeNull();
		expect(yearOf(undefined)).toBeNull();
		expect(yearOf('')).toBeNull();
		expect(yearOf('abcd')).toBeNull();
		expect(yearOf('0000')).toBeNull();
	});
});
