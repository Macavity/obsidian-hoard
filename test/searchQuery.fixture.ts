import type { SearchConfig } from '../src/SearchQuery';

export interface Film {
	id: string;
	title: string;
	cast: string[];
	studio: string;
	year: number | null;
	rating: number | null;
}

export const FILMS: Film[] = [
	{ id: 'dune', title: 'Dune', cast: ['Timothée Chalamet', 'Zendaya'], studio: 'Legendary', year: 2021, rating: 4.5 },
	{ id: 'blade', title: 'Blade Runner 2049', cast: ['Ryan Gosling', 'Harrison Ford'], studio: 'Alcon', year: 2017, rating: 4 },
	{ id: 'passengers', title: 'Passengers', cast: ['Jennifer Lawrence', 'Chris Pratt'], studio: 'Columbia', year: 2016, rating: 3 },
	{ id: 'avengers', title: 'The Avengers', cast: ['Robert Downey', 'Chris Evans'], studio: 'Marvel', year: 2012, rating: 4 },
	{ id: 'rezero', title: 'Re:Zero', cast: ['Yusuke Kobayashi', 'Rie|Takahashi'], studio: 'White Fox', year: null, rating: null },
	{ id: 'arrival', title: 'Arrival', cast: ['Amy Adams', 'Jeremy Renner'], studio: 'Legendary', year: 2016, rating: -1 },
];

export const FILM_SEARCH: SearchConfig<Film> = {
	id: (f) => f.id,
	fields: [
		{ name: 'title', label: 'Title', weight: 1, text: (f) => [f.title] },
		{ name: 'cast', label: 'Cast', weight: 0.5, text: (f) => f.cast },
		{ name: 'studio', label: 'Studio', weight: 0.3, aliases: ['dev'], text: (f) => [f.studio] },
		{ name: 'year', label: 'Year', weight: 0.1, text: (f) => (f.year === null ? [] : [String(f.year)]), number: (f) => f.year },
		{ name: 'rating', label: 'Rating', number: (f) => f.rating },
	],
};
