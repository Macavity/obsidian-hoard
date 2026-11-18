import type { App } from 'obsidian';
import type { LocalStore } from '../../storage/LocalStore';
import type { VaultLayout } from '../../storage/VaultLayout';
import type { WatchLogImporter } from '../../WatchLogOnboardingModal';
import { planCleanup, runCleanup } from './cleanup';
import type { WatchLogSources } from './detect';
import { importFork } from './importFork';
import { importOriginal } from './importOriginal';
import { setDecision } from './onboardingState';
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
export function createImporter(deps: ImporterDeps, sources: WatchLogSources): WatchLogImporter {
	const { app, local } = deps;
	return {
		sources,
		run: (kind, progress) => kind === 'fork'
			? importFork(sources.fork!, deps.ctx(), progress)
			: importOriginal(sources.original!, deps.ctx(), progress),
		plan: (imported) => planCleanup(app, sources, deps.layout(), imported),
		cleanup: (items) => runCleanup(app, items, deps.layout()),
		writeReport: (markdown) => writeReportNote(app, deps.layout(), markdown),
		decide: (kind, d) => setDecision(local, kind, d),
		openFile: deps.openFile,
	};
}
