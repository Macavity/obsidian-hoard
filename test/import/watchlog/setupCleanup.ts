// FakeApp with detected WatchLog sources and a Hoard layout for cleanup tests.
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/shared/storage/VaultLayout';
import { detectWatchLogSources } from '../../../src/modules/import/services/watchlog/detect';

export async function setupCleanup(files: Record<string, string>, types: string[] = ['Movie']) {
	const f = createFakeApp(files);
	const sources = await detectWatchLogSources(f.app.vault, () => false);
	const layout = new VaultLayout('Hoard', () => types);
	return { f, sources, layout };
}
