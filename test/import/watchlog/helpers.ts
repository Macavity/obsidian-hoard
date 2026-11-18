import { parse, stringify } from 'yaml';
import type { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/shared/storage/VaultLayout';
import type { LocalStore } from '../../../src/shared/storage/LocalStore';
import { SharedConfigStore } from '../../../src/shared/storage/SharedConfigStore';
import { HistoryStore } from '../../../src/shared/storage/HistoryStore';
import type { ImportContext, WatchLogData } from '../../../src/modules/import/services/watchlog/schema1Types';

const yaml = { parse, stringify };

/** Copies of the fake app's vault and adapter files, to assert that nothing was written. */
export function snapshot(f: Pick<ReturnType<typeof createFakeApp>, 'files' | 'adapterFiles'>) {
	return { files: new Map(f.files), adapterFiles: new Map(f.adapterFiles) };
}

/** An import context for the fake app below Hoard root `root`, with the given type names. */
export function importContext(
	f: ReturnType<typeof createFakeApp>, local: LocalStore, root: string, types: string[],
): ImportContext {
	const layout = new VaultLayout(root, () => types);
	const shared = new SharedConfigStore(f.app.vault, () => layout, yaml);
	const history = new HistoryStore(f.app.vault, () => layout);
	return { vault: f.app.vault, fileManager: f.app.fileManager, local, shared, history, yaml, layout };
}

/** The type names of WatchLog data. */
export const typeNames = (data: WatchLogData): string[] => (data.settings.types ?? []).map((t) => t.name);
