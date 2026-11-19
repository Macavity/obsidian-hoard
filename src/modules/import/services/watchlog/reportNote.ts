import { normalizePath, type TFile, type Vault } from 'obsidian';
import type { VaultLayout } from '../../../../shared/storage/VaultLayout';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date: the user's "today", not UTC's. */
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function ensureFolder(vault: Pick<Vault, 'getAbstractFileByPath' | 'createFolder' | 'create'>, path: string): Promise<void> {
	if (path && !vault.getAbstractFileByPath(path)) await vault.createFolder(path);
}

/** Writes the (already rendered) report to `<root>/WatchLog-Import YYYY-MM-DD.md`, suffixed " 2", " 3", … on collision. */
export async function writeReportNote(vault: Pick<Vault, 'getAbstractFileByPath' | 'createFolder' | 'create'>, layout: VaultLayout, content: string, date: Date = new Date()): Promise<TFile> {
	await ensureFolder(vault, layout.root);
	const stem = `WatchLog-Import ${localDate(date)}`;
	const at = (n: number): string => normalizePath(`${layout.root}/${n === 1 ? stem : `${stem} ${n}`}.md`);
	let n = 1;
	while (vault.getAbstractFileByPath(at(n))) n++;
	return vault.create(at(n), content);
}
