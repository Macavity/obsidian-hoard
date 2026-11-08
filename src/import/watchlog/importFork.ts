import { normalizePath, type TFile } from 'obsidian';
import { renameTopLevelBlock } from '../../storage/baseFile';
import { VaultLayout, detectRoot } from '../../storage/VaultLayout';
import type { ForkSource } from './detect';
import { managedFiles } from './paths';
import { emptyImportReport, type ImportReport, type Progress } from './report';
import type { ImportContext } from './schema1Types';

const TEXT_EXTENSIONS = new Set(['md', 'base', 'json', 'txt', 'csv', 'canvas']);

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isBlank = (v: unknown): boolean => v === undefined || v === null || v === '';

async function ensureFolder(ctx: ImportContext, path: string): Promise<void> {
	const i = path.lastIndexOf('/');
	if (i < 0) return;
	const dir = path.slice(0, i);
	if (ctx.app.vault.getAbstractFileByPath(dir)) return;
	await ensureFolder(ctx, dir);
	await ctx.app.vault.createFolder(dir);
}

async function copyFile(file: TFile, target: string, ctx: ImportContext): Promise<void> {
	await ensureFolder(ctx, target);
	if (TEXT_EXTENSIONS.has(file.extension.toLowerCase())) {
		await ctx.app.vault.create(target, await ctx.app.vault.read(file));
	} else {
		await ctx.app.vault.createBinary(target, await ctx.app.vault.readBinary(file));
	}
}

async function importBase(src: ForkSource, ctx: ImportContext, report: ImportReport): Promise<void> {
	const existing = await detectRoot(ctx.app.vault);
	if (existing !== null) {
		report.review.push({ path: existing ? `${existing}/Hoard.base` : 'Hoard.base', reason: 'exists', detail: 'Hoard base kept' });
		return;
	}
	const content = renameTopLevelBlock(await ctx.app.vault.read(src.base), 'watchlog', 'hoard');
	await ensureFolder(ctx, ctx.layout.basePath);
	await ctx.app.vault.create(ctx.layout.basePath, content);
	report.created++;
	await ctx.shared.load();
	await ctx.shared.ensureFilter();
}

function importSettings(src: ForkSource, ctx: ImportContext, report: ImportReport): void {
	const data = src.data;
	if (!data) return;
	const local = ctx.local.data;
	for (const [k, v] of Object.entries(data.settings ?? {})) {
		if (isBlank(v) || !isBlank(local.settings[k])) continue;
		local.settings[k] = v;
		report.filled++;
	}
	for (const [id, entry] of Object.entries(data.cache ?? {})) {
		local.cache[id] = { ...entry, ...local.cache[id] };
	}
	ctx.local.queueSave();
}

/** Copies the notes, history and base of a WatchLog Sync fork below Hoard's root; the source stays untouched. */
export async function importFork(src: ForkSource, ctx: ImportContext, progress: Progress): Promise<ImportReport> {
	const report = emptyImportReport();
	const forkLayout = new VaultLayout(src.root, () => src.typeNames);
	const files = managedFiles(ctx.app, forkLayout, src.typeNames, ctx.layout.root);
	const prefix = src.root ? `${src.root}/` : '';
	let done = 0;
	for (const file of files) {
		const target = normalizePath(ctx.layout.root ? `${ctx.layout.root}/${file.path.slice(prefix.length)}` : file.path.slice(prefix.length));
		try {
			if (ctx.app.vault.getAbstractFileByPath(target)) {
				report.review.push({ path: target, reason: 'exists', detail: 'not overwritten' });
			} else {
				await copyFile(file, target, ctx);
				report.created++;
			}
		} catch (e) {
			report.review.push({ path: target, reason: 'error', detail: errMsg(e) });
			report.errors.push(`${target}: ${errMsg(e)}`);
		}
		progress('notes', ++done, files.length);
	}
	try {
		await importBase(src, ctx, report);
	} catch (e) {
		report.review.push({ path: ctx.layout.basePath, reason: 'error', detail: errMsg(e) });
		report.errors.push(`${ctx.layout.basePath}: ${errMsg(e)}`);
	}
	progress('base', 1, 1);
	importSettings(src, ctx, report);
	progress('settings', 1, 1);
	return report;
}
