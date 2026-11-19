import type { EntryIndex } from '../storage/EntryIndex';

/**
 * Drops the copy handed to the UI for every index change in the manager's own folders, except a copy
 * with a pending silent edit (it stays until written), then calls `onTouched` once if any id was its own.
 */
export function followIndex(
	index: Pick<EntryIndex, 'onChange'>,
	views: Map<string, unknown>,
	dirty: Set<string>,
	owns: (id: string) => boolean,
	onTouched: () => void,
): void {
	index.onChange((ids) => {
		let touched = false;
		for (const id of ids) {
			if (!owns(id)) continue;
			touched = true;
			if (!dirty.has(id)) views.delete(id);
		}
		if (touched) onTouched();
	});
}
