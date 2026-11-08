// FakeApp with a WatchLog Sync fork; the context imports below Hoard root 'Hoard'.
import { parse, stringify } from 'yaml';
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/storage/VaultLayout';
import { LocalStore } from '../../../src/storage/LocalStore';
import { SharedConfigStore } from '../../../src/storage/SharedConfigStore';
import { HistoryStore } from '../../../src/storage/HistoryStore';
import { detectWatchLogSources } from '../../../src/import/watchlog/detect';
import type { ForkSource } from '../../../src/import/watchlog/detect';
import type { ImportContext } from '../../../src/import/watchlog/schema1Types';

const yaml = { parse, stringify };
const FORK_DATA_PATH = '.obsidian/plugins/watchlog-sync/data.json';

export async function setupFork(files: Record<string, string>, forkData?: unknown) {
	const f = createFakeApp(files);
	if (forkData !== undefined) f.adapterFiles.set(FORK_DATA_PATH, JSON.stringify(forkData));
	const local = new LocalStore(f.plugin);
	const layout = new VaultLayout('Hoard', () => ['Movie']);
	const shared = new SharedConfigStore(f.app, () => layout, yaml);
	const history = new HistoryStore(f.app, () => layout);
	const ctx: ImportContext = { app: f.app, local, shared, history, yaml, layout };
	const detected = (await detectWatchLogSources(f.app)).fork as ForkSource;
	const src: ForkSource = { ...detected, typeNames: ['Movie'] };
	return { f, ctx, src, local };
}
