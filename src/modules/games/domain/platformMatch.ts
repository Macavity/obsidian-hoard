/** Lowercased word tokens of a platform name, split into alpha and numeric. */
function platformTokens(name: string): { alpha: Set<string>; num: Set<string> } {
	const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
	return {
		alpha: new Set(tokens.filter((tok) => !/^\d+$/.test(tok))),
		num: new Set(tokens.filter((tok) => /^\d+$/.test(tok))),
	};
}

/**
 * Loose platform-name equality across APIs: the smaller alpha-token set must be contained in the
 * larger ("PC" ⊂ "Windows PC" ⊂ "PC (Microsoft Windows)"), and numeric tokens (console
 * generations) must match exactly, so "PlayStation 5" never matches "PlayStation 4".
 */
export function platformMatches(a: string, b: string): boolean {
	const ta = platformTokens(a);
	const tb = platformTokens(b);
	const [small, big] = ta.alpha.size <= tb.alpha.size ? [ta.alpha, tb.alpha] : [tb.alpha, ta.alpha];
	if (small.size === 0) return false;
	for (const tok of small) if (!big.has(tok)) return false;
	if (ta.num.size !== tb.num.size) return false;
	for (const n of ta.num) if (!tb.num.has(n)) return false;
	return true;
}
