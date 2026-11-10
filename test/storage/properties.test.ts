import { describe, expect, it } from 'vitest';
import { ALL_PROPERTY_NAMES, COMMON_PROPS, GAME_PROPS, READING_PROPS, TITLE_PROPS } from '../../src/storage/properties';

describe('property names', () => {
	it('are Title Case words with upper-case acronyms', () => {
		for (const name of ALL_PROPERTY_NAMES) expect(name).toMatch(/^[A-Z][A-Za-z-]*( [A-Z][A-Za-z-]*)*$/);
	});
	it('use the Library names where meaning and form match', () => {
		expect(COMMON_PROPS).toMatchObject({ name: 'Name', type: 'Type', cover: 'Cover', url: 'URL', favorite: 'Favorite' });
		expect(TITLE_PROPS).toMatchObject({ runtime: 'Runtime', trailer: 'Trailer', cast: 'Cast', director: 'Director' });
		expect(READING_PROPS).toMatchObject({ author: 'Author', malId: 'MAL ID' });
		expect(GAME_PROPS).toMatchObject({ genre: 'Genre', platforms: 'Platforms', achievements: 'Achievements', lastPlayed: 'Last Played', coop: 'Co-op' });
	});
	it('keep Hoard names where the value form differs', () => {
		expect(COMMON_PROPS).toMatchObject({ dateAdded: 'Date Added', releaseDate: 'Release Date', externalId: 'External ID', rating: 'Rating' });
	});
});
