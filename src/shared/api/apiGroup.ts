/**
 * The API group to use for a title type. The three built-in types are hardcoded and
 * never live in the mapping; anything else routes via `settings.typeApiMapping`,
 * where a missing entry returns '' (no API configured).
 */
export function getApiGroupForType(
	type: string,
	mapping: Record<string, 'anime' | 'movie' | ''> | undefined,
): 'anime' | 'movie' | '' {
	if (type === 'Anime') return 'anime';
	if (type === 'Movie' || type === 'TV Show' || type === 'TvShow') return 'movie';
	return mapping?.[type] ?? '';
}
