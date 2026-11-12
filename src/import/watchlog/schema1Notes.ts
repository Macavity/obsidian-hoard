import { TFile, type App } from 'obsidian';
import type { YamlIO } from '../../storage/storageTypes';
import type { ImportReport } from './report';
import { isRecord } from './schema1Types';
import type { Fm } from '../../storage/storageTypes';

const FM_RE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(\r?\n|$)/;

/** Frontmatter value equality across YAML scalars and lists (7.5 and "7.5" alike). */
export const sameValue = (a: unknown, b: unknown): boolean => {
	const scalar = (v: unknown): unknown => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : v ?? null);
	const norm = (v: unknown): string => JSON.stringify(Array.isArray(v) ? v.map(scalar) : scalar(v));
	return norm(a) === norm(b);
};

/** Everything after the frontmatter of a note, without the blank lines that follow it. */
export const bodyOf = (content: string): string => content.slice(FM_RE.exec(content)?.[0].length ?? 0).replace(/^(\r?\n)+/, '');

const show = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? 'null');

/** Creates a folder unless it exists (or another writer created it meanwhile). */
export async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path || app.vault.getAbstractFileByPath(path)) return;
	try {
		await app.vault.createFolder(path);
	} catch {
		// created concurrently
	}
}

/** Creates notes or fills the keys they lack; existing values are never overwritten. */
export class NoteWriter {
	constructor(private app: App, private yaml: YamlIO, private report: ImportReport) {}

	/**
	 * Creates the note, or adds only the keys it lacks. A key of `apiValues` (API values WatchLog
	 * wrote) is removed when the note still holds exactly that value: it lives in the cache now, and
	 * a differing value stays as the user's override (E9).
	 */
	async write(path: string, fm: Fm, body: string, apiValues: Fm = {}): Promise<void> {
		const { vault, fileManager } = this.app;
		const file = vault.getAbstractFileByPath(path);
		if (!file) {
			await ensureFolder(this.app, path.slice(0, Math.max(0, path.lastIndexOf('/'))));
			await vault.create(path, `---\n${this.yaml.stringify(fm)}---\n\n${body}`);
			this.report.created++;
			return;
		}
		if (!(file instanceof TFile)) {
			this.report.review.push({ path, reason: 'exists', code: 'notAFile' });
			return;
		}
		let current: Fm;
		try {
			current = this.frontmatter(await vault.read(file));
		} catch {
			this.report.review.push({ path, reason: 'error', code: 'invalidYaml' });
			this.report.errors.push(`${path}: invalid YAML`);
			return;
		}
		const written = (k: string): boolean => sameValue(current[k], apiValues[k]) && !(k in fm && sameValue(current[k], fm[k]));
		const stale = Object.keys(apiValues).filter((k) => k in current && written(k));
		const missing = Object.keys(fm).filter((k) => !(k in current) || stale.includes(k));
		for (const k of Object.keys(fm)) {
			if (k in current && !stale.includes(k) && !sameValue(current[k], fm[k])) {
				this.report.review.push({
					path, reason: 'kept-value', code: 'keptValue', params: { key: k, hoard: show(current[k]), watchlog: show(fm[k]) },
				});
			}
		}
		if (missing.length === 0 && stale.length === 0) return;
		await fileManager.processFrontMatter(file, (raw: Fm) => {
			for (const k of stale) if (sameValue(raw[k], apiValues[k])) delete raw[k];
			for (const k of missing) if (!(k in raw)) raw[k] = fm[k];
		});
		this.report.filled++;
	}

	private frontmatter(content: string): Fm {
		const m = FM_RE.exec(content);
		if (!m) return {};
		const parsed = this.yaml.parse(m[1] ?? '');
		return isRecord(parsed) ? parsed : {};
	}
}
