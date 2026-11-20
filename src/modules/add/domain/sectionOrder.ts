import { ADD_KINDS, type AddKind } from './provider';

/** Preferred kinds first (in their order), then the canonical order; only kinds in `available`. */
export function orderKinds(available: readonly AddKind[], preferred: readonly AddKind[] = []): AddKind[] {
	const wanted = new Set(available);
	const ordered = [...preferred, ...ADD_KINDS].filter((kind) => wanted.has(kind));
	return [...new Set(ordered)];
}
