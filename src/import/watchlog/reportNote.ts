import { normalizePath, type App, type TFile } from 'obsidian';
import type { VaultLayout } from '../../storage/VaultLayout';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date: the user's "today", not UTC's. */
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function ensureFolder(app: App, path: string): Promise<void> {
	if (path && !app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
}

/** Writes the (already rendered) report to `<root>/WatchLog-Import YYYY-MM-DD.md`, suffixed " 2", " 3", … on collision. */
export async function writeReportNote(app: App, layout: VaultLayout, content: string, date: Date = new Date()): Promise<TFile> {
	await ensureFolder(app, layout.root);
	const stem = `WatchLog-Import ${localDate(date)}`;
	const at = (n: number): string => normalizePath(`${layout.root}/${n === 1 ? stem : `${stem} ${n}`}.md`);
	let n = 1;
	while (app.vault.getAbstractFileByPath(at(n))) n++;
	return app.vault.create(at(n), content);
}
