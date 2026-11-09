// FakeApp with a WatchLog Sync fork; the context imports below Hoard root `root` (default 'Hoard').
import { createFakeApp } from '../../fakes/fakeApp';
import { LocalStore } from '../../../src/storage/LocalStore';
import { detectWatchLogSources } from '../../../src/import/watchlog/detect';
import type { ForkSource } from '../../../src/import/watchlog/detect';
import { importContext } from './helpers';
const FORK_DATA_PATH = '.obsidian/plugins/watchlog-sync/data.json';

export async function setupFork(files: Record<string, string>, forkData?: unknown, root = 'Hoard') {
	const f = createFakeApp(files);
	if (forkData !== undefined) f.adapterFiles.set(FORK_DATA_PATH, JSON.stringify(forkData));
	const local = new LocalStore(f.plugin);
	const ctx = importContext(f, local, root, ['Movie']);
	const detected = (await detectWatchLogSources(f.app)).fork as ForkSource;
	const src: ForkSource = { ...detected, typeNames: ['Movie'] };
	return { f, ctx, src, local };
}
