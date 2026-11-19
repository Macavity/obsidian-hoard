import { getApiGroupForType } from '../../../shared/api/apiGroup';

export type TypeApiRoute = { kind: 'locked'; apis: string } | { kind: 'select' };
export type ApiGroup = '' | 'anime' | 'movie';

/** Built-in types route to fixed providers; every other type picks its API group. */
export function typeApiRoute(typeName: string): TypeApiRoute {
	const group = getApiGroupForType(typeName, undefined);
	if (group === 'anime') return { kind: 'locked', apis: 'Jikan / AniList' };
	if (group === 'movie') return { kind: 'locked', apis: 'OMDb / TMDB' };
	return { kind: 'select' };
}

export function parseApiGroup(value: string): ApiGroup {
	if (value === 'anime') return 'anime';
	if (value === 'movie') return 'movie';
	return '';
}
