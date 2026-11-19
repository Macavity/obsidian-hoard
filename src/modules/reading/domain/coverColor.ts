const COVER_PALETTE = [
	'#3a4a6b', '#4a3a6b', '#6b3a4a', '#6b5a3a',
	'#3a6b5a', '#5a6b3a', '#3a5a6b', '#6b3a5a',
];

export function coverFallbackColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	}
	return COVER_PALETTE[hash % COVER_PALETTE.length] ?? '#3a4a6b';
}
