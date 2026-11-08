import { normalizePath, type App, type TFile } from 'obsidian';
import type { VaultLayout } from '../../storage/VaultLayout';
import type { WatchLogSourceKind } from './detect';
import type { ImportReport, ReviewItem } from './report';

const HEADINGS: Record<WatchLogSourceKind, string> = { original: 'WatchLog', fork: 'WatchLog Sync' };
const REASONS: [ReviewItem['reason'], string][] = [
	['exists', 'Already existed'], ['kept-value', 'Kept Hoard values'], ['error', 'Errors'],
];

function section(kind: WatchLogSourceKind, r: ImportReport): string[] {
	const lines = [`## ${HEADINGS[kind]}`, '', `Created ${r.created}, filled ${r.filled}, review ${r.review.length}, errors ${r.errors.length}.`, ''];
	for (const [reason, title] of REASONS) {
		const items = r.review.filter((i) => i.reason === reason);
		const plain = reason === 'error' ? r.errors : [];
		if (!items.length && !plain.length) continue;
		lines.push(`### ${title}`, '');
		for (const i of items) lines.push(`- [[${i.path}]] – ${i.detail}`);
		for (const e of plain) lines.push(`- ${e}`);
		lines.push('');
	}
	return lines;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (path && !app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
}

/** Writes `<root>/WatchLog-Import YYYY-MM-DD.md` listing everything the user should review. */
export async function writeReportNote(
	app: App, layout: VaultLayout, reports: Partial<Record<WatchLogSourceKind, ImportReport>>, date: Date = new Date(),
): Promise<TFile> {
	const body = (['original', 'fork'] as const).flatMap((k) => (reports[k] ? section(k, reports[k]) : []));
	const content = ['# WatchLog import', '', ...body].join('\n');
	await ensureFolder(app, layout.root);
	const stem = `WatchLog-Import ${date.toISOString().slice(0, 10)}`;
	const at = (n: number): string => normalizePath(`${layout.root}/${n === 1 ? stem : `${stem} ${n}`}.md`);
	let n = 1;
	while (app.vault.getAbstractFileByPath(at(n))) n++;
	return app.vault.create(at(n), content);
}
