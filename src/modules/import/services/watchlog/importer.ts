import type { FileManager, TFile, Vault } from 'obsidian';
import type { LocalStore } from '../../../../shared/storage/LocalStore';
import type { VaultLayout } from '../../../../shared/storage/VaultLayout';
import { planCleanup, runCleanup, type CleanupItem } from './cleanup';
import type { WatchLogSourceKind, WatchLogSources } from './detect';
import type { ImportReport, Progress } from '../../domain/importReport';
import { importFork } from './importFork';
import { importOriginal } from './importOriginal';
import { setDecision, type ImportDecision } from './onboardingState';
import { writeReportNote } from './reportNote';
import type { ImportContext } from './schema1Types';

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
export function createImporter(
	vault: Vault,
	fileManager: Pick<FileManager, 'trashFile'>,
	local: LocalStore,
	ctx: () => ImportContext,
	layout: () => VaultLayout,
	openFile: (path: string) => void,
	sources: WatchLogSources,
): WatchLogImporter {
	return {
		sources,
		run: (kind: WatchLogSourceKind, progress: Progress) => kind === 'fork'
			? importFork(sources.fork!, ctx(), progress)
			: importOriginal(sources.original!, ctx(), progress),
		plan: (imported: WatchLogSourceKind[]) => planCleanup(vault, sources, layout(), imported),
		cleanup: (items: CleanupItem[]) => runCleanup(vault, fileManager, items, layout()),
		writeReport: (markdown: string) => writeReportNote(vault, layout(), markdown),
		decide: (kind: WatchLogSourceKind, d: ImportDecision) => setDecision(local, kind, d),
		openFile,
	};
}
