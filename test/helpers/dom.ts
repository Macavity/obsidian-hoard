/** Typed NodeList-to-array helpers (the tsconfig lib has no dom.iterable, so spreading a NodeList is `any`). */
export function qsa<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
	const out: T[] = [];
	root.querySelectorAll<T>(selector).forEach((e) => out.push(e));
	return out;
}

export const textsOf = (root: ParentNode, selector: string): string[] => qsa(root, selector).map((e) => e.textContent ?? '');
