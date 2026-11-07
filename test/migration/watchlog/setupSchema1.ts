// FakeApp holding a WatchLog schema-1 data.json plus notes as WatchLog wrote them; `run` converts them.
import { parse, stringify } from 'yaml';
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout, detectRoot } from '../../../src/storage/VaultLayout';
import { LocalStore } from '../../../src/storage/LocalStore';
import { SharedConfigStore } from '../../../src/storage/SharedConfigStore';
import { HistoryStore } from '../../../src/storage/HistoryStore';
import { migrateSchema1, watchLogRoot } from '../../../src/migration/watchlog/schema1';

const yaml = { parse, stringify };

/** Notes of the fixture entries at WatchLog's paths (its frontmatter, no Hoard keys). */
export const WATCHLOG_NOTES: Record<string, string> = {
	'WatchLog/TV Show/Dark.md': '---\ntitle: "Dark"\ntype: "TV Show"\nstatus: "Watching"\npriority: "High"\nrating: 0\nprogress: 67%\ntotalEpisodes: 18\n---\n\n## Notes\n\nGreat show\n',
	'WatchLog/Reading/Books/Dune.md': '---\ntitle: "Dune"\nauthor: "Frank Herbert"\nstatus: "Reading"\nrating: 0\npagesRead: 120\ntype: book\n---\n\n## Notes\n\n\n## Quotes\n',
	'WatchLog/Reading/Manga/Berserk.md': '---\ntitle: "Berserk"\nauthor: "Kentaro Miura"\nstatus: "On Hold"\ntype: manga\n---\n\n## Notes\n\n\n## Quotes\n',
	'Gaming/Hades.md': '---\ntitle: "Hades"\ndeveloper: "Supergiant"\ntype: game\n---\n\n## Notes\n',
	'Lists/Shopping.md': '# Shopping\n\n## Notes\n\n\n## Data\n```json\n{}\n```\n',
};

export function setupSchema1(data: unknown, files: Record<string, string>) {
	const f = createFakeApp({ ...WATCHLOG_NOTES, ...files });
	f.plugin.data = structuredClone(data);

	async function run() {
		const local = new LocalStore(f.plugin);
		const loaded = await local.load();
		if (loaded.schema !== 1) throw new Error('fixture is not schema 1');
		const types = (loaded.data.settings.types ?? []).map((t) => t.name);
		const layout = new VaultLayout((await detectRoot(f.app.vault)) ?? watchLogRoot(loaded.data), () => types);
		const shared = new SharedConfigStore(f.app, () => layout, yaml);
		const history = new HistoryStore(f.app, () => layout);
		return migrateSchema1({
			app: f.app, pluginDir: f.plugin.manifest.dir, local, data: loaded.data, shared, history, yaml, layout,
		});
	}

	/** Another run against the same vault with the same data.json again (a second device). */
	async function rerun() {
		f.plugin.data = structuredClone(data);
		return run();
	}

	return Promise.resolve({ run, rerun, f });
}
