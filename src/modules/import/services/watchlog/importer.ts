import type { App, TFile } from 'obsidian';
import type { LocalStore } from '../../../../shared/storage/LocalStore';
import type { VaultLayout } from '../../../../shared/storage/VaultLayout';
import { planCleanup, runCleanup, type CleanupItem } from './cleanup';
import type { WatchLogSourceKind, WatchLogSources } from './detect';
import type { ImportReport, Progress } from '../../../../shared/domain/importReport';
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

/** Everything the wizard needs from the import logic; the wizard (ui) only sees this shape. */
export interface WatchLogImporter {
	sources: WatchLogSources;
	run(kind: WatchLogSourceKind, progress: Progress): Promise<ImportReport>;
	plan(imported: WatchLogSourceKind[]): Promise<CleanupItem[]>;
	cleanup(items: CleanupItem[]): Promise<{ done: number; errors: string[] }>;
	/** Writes the rendered report as a note. */
	writeReport(markdown: string): Promise<TFile>;
	decide(kind: WatchLogSourceKind, d: ImportDecision): void;
	openFile(path: string): void;
}

/** Wires the onboarding wizard to the import logic. */
export function createImporter(deps: ImporterDeps, sources: WatchLogSources): WatchLogImporter {
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
