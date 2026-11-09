import { TFile, TFolder, type App } from 'obsidian';
import type { OriginalSource } from './detect';
import { isListNote, originalFolders, originalNotePath } from './originalPaths';
import { emptyImportReport, type ImportReport, type Progress } from './report';
import { importWatchLogData, mergeSideFiles } from './schema1';
import { bodyOf, ensureFolder } from './schema1Notes';
import type { ImportContext } from './schema1Types';
import { registerTypes } from './registerTypes';


/** Copies WatchLog's custom lists (notes with a `## Data` json block) into Hoard's lists folder. */
async function copyLists(app: App, from: string, to: string, report: ImportReport): Promise<void> {
	const folder = app.vault.getAbstractFileByPath(from);
	if (!(folder instanceof TFolder)) return;
	for (const file of folder.children) {
		if (!(file instanceof TFile) || file.extension !== 'md') continue;
		const target = `${to}/${file.name}`;
		try {
			const content = await app.vault.read(file);
			if (!isListNote(content)) continue;
			if (app.vault.getAbstractFileByPath(target)) {
				report.review.push({ path: target, reason: 'exists' });
				continue;
			}
			await ensureFolder(app, to);
			await app.vault.create(target, content);
			report.created++;
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			report.review.push({ path: target, reason: 'error', code: 'failed', params: { message } });
			report.errors.push(`${target}: ${message}`);
		}
	}
}

/**
 * Imports the original WatchLog plugin's data as a copy below Hoard's root: new notes take the body
 * of WatchLog's note, custom lists are copied, existing Hoard notes only get missing keys. Nothing is
 * written to WatchLog's plugin folder or notes.
 */
export async function importOriginal(src: OriginalSource, ctx: ImportContext, progress: Progress): Promise<ImportReport> {
	const data = structuredClone(src.data);
	let report = emptyImportReport();
	try {
		await mergeSideFiles(ctx.app.vault.adapter, src.dir, data);
		const folders = originalFolders(data);
		const { vault } = ctx.app;
		const oldBody = async (kind: Parameters<typeof originalNotePath>[1], title: string, type?: string): Promise<string | null> => {
			const file = vault.getAbstractFileByPath(originalNotePath(folders, kind, title, type));
			return file instanceof TFile ? bodyOf(await vault.read(file)) : null;
		};
		report = await importWatchLogData(data, ctx, { progress, oldBody });
		await registerTypes(ctx, data.settings.types);
		await copyLists(ctx.app, folders.lists, ctx.layout.customListsFolder, report);
	} catch (e) {
		report.errors.push(e instanceof Error ? e.message : String(e));
	}
	return report;
}
