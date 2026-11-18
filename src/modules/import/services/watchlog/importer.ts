import type { App } from 'obsidian';
import type { LocalStore } from '../../../../shared/storage/LocalStore';
import type { VaultLayout } from '../../../../shared/storage/VaultLayout';
import { planCleanup, runCleanup, type CleanupItem } from './cleanup';
import type { WatchLogSourceKind, WatchLogSources } from './detect';
import type { Progress } from '../../../../shared/domain/importReport';
import { importFork } from './importFork';
import { importOriginal } from './importOriginal';
import { setDecision, type ImportDecision } from './onboardingState';
import { writeReportNote } from './reportNote';
import type { ImportContext } from './schema1Types';

export interface ImporterDeps {
	app: App;
	local: LocalStore;
	ctx: () => ImportContext;
	layout: () => VaultLayout;
	openFile: (path: string) => void;
}

/** Wires the onboarding wizard to the import logic. */
export function createImporter(deps: ImporterDeps, sources: WatchLogSources) {
	const { app, local } = deps;
	return {
		sources,
		run: (kind: WatchLogSourceKind, progress: Progress) => kind === 'fork'
			? importFork(sources.fork!, deps.ctx(), progress)
			: importOriginal(sources.original!, deps.ctx(), progress),
		plan: (imported: WatchLogSourceKind[]) => planCleanup(app, sources, deps.layout(), imported),
		cleanup: (items: CleanupItem[]) => runCleanup(app, items, deps.layout()),
		writeReport: (markdown: string) => writeReportNote(app, deps.layout(), markdown),
		decide: (kind: WatchLogSourceKind, d: ImportDecision) => setDecision(local, kind, d),
		openFile: deps.openFile,
	};
}
