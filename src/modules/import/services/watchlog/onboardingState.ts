import type { LocalStore } from '../../storage/LocalStore';
import type { WatchLogSourceKind, WatchLogSources } from './detect';

export type ImportDecision = 'imported' | 'declined';

export function getDecision(local: LocalStore, kind: WatchLogSourceKind): ImportDecision | undefined {
	return local.data.ui.watchlogImport?.[kind];
}

export function setDecision(local: LocalStore, kind: WatchLogSourceKind, d: ImportDecision): void {
	local.data.ui.watchlogImport = { ...local.data.ui.watchlogImport, [kind]: d };
	local.queueSave();
}

/** Found and undecided sources, fork first. */
export function pendingSources(local: LocalStore, s: WatchLogSources): WatchLogSourceKind[] {
	const kinds: WatchLogSourceKind[] = ['fork', 'original'];
	return kinds.filter((k) => s[k] && getDecision(local, k) === undefined);
}
