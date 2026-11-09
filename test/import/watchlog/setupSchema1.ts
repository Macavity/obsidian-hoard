// FakeApp plus WatchLog data; `run` imports it through importWatchLogData below the Hoard root.
import { createFakeApp } from '../../fakes/fakeApp';
import { detectRoot } from '../../../src/storage/VaultLayout';
import { LocalStore } from '../../../src/storage/LocalStore';
import { importContext, typeNames } from './helpers';
import type { OriginalSource } from '../../../src/import/watchlog/detect';
import { importWatchLogData } from '../../../src/import/watchlog/schema1';
import type { WatchLogData } from '../../../src/import/watchlog/schema1Types';

/** Notes of the fixture entries at WatchLog's paths (the import ignores them: it writes below the Hoard root) (its frontmatter, no Hoard keys). */
export const WATCHLOG_NOTES: Record<string, string> = {
	'WatchLog/TV Show/Dark.md': '---\ntitle: "Dark"\ntype: "TV Show"\nstatus: "Watching"\npriority: "High"\nrating: 0\nprogress: 67%\ntotalEpisodes: 18\n---\n\n## Notes\n\nGreat show\n',
	'WatchLog/Reading/Books/Dune.md': '---\ntitle: "Dune"\nauthor: "Frank Herbert"\nstatus: "Reading"\nrating: 0\npagesRead: 120\ntype: book\n---\n\n## Notes\n\n\n## Quotes\n',
	'WatchLog/Reading/Manga/Berserk.md': '---\ntitle: "Berserk"\nauthor: "Kentaro Miura"\nstatus: "On Hold"\ntype: manga\n---\n\n## Notes\n\n\n## Quotes\n',
	'Gaming/Hades.md': '---\ntitle: "Hades"\ndeveloper: "Supergiant"\ntype: game\n---\n\n## Notes\n',
	'Lists/Shopping.md': '# Shopping\n\n## Notes\n\n\n## Data\n```json\n{}\n```\n',
};

export function setupSchema1(data: unknown, files: Record<string, string>) {
	const f = createFakeApp(files);
	const local = new LocalStore(f.plugin);

	async function run() {
		const ctx = importContext(f, local, (await detectRoot(f.app.vault)) ?? 'Hoard', typeNames(data as WatchLogData));
		const report = await importWatchLogData(data as WatchLogData, ctx);
		await local.flush();
		return report;
	}

	/** Another run against the same vault with the same data again. */
	const rerun = run;

	return Promise.resolve({ run, rerun, f, local });
}

const ORIGINAL_DIR = '.obsidian/plugins/watchlog';

/** Like `setupSchema1`, plus WatchLog's data.json in its plugin folder and the original source for `importOriginal`. */
export async function setupOriginal(data: unknown, files: Record<string, string>) {
	const base = await setupSchema1(data, files);
	const { f, local } = base;
	const d = data as WatchLogData;
	f.adapterFiles.set(`${ORIGINAL_DIR}/data.json`, JSON.stringify(d));
	const ctx = importContext(f, local, (await detectRoot(f.app.vault)) ?? 'Hoard', typeNames(d));
	const src: OriginalSource = {
		kind: 'original', dir: ORIGINAL_DIR, data: d, pluginEnabled: false,
		counts: { titles: d.titles.length, books: 0, manga: 0, games: 0, lists: 0, notes: 0 },
	};
	return { f, ctx, src };
}
