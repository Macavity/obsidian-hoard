// FakeApp with detected WatchLog sources and a Hoard layout for cleanup tests.
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/storage/VaultLayout';
import { detectWatchLogSources } from '../../../src/import/watchlog/detect';

export async function setupCleanup(files: Record<string, string>, types: string[] = ['Movie']) {
	const f = createFakeApp(files);
	const sources = await detectWatchLogSources(f.app);
	const layout = new VaultLayout('Hoard', () => types);
	return { f, sources, layout };
}
