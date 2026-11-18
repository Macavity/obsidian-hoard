import type { FileManager, Vault } from 'obsidian';
import type { EntryIndex } from '../storage/EntryIndex';
import type { LocalStore } from '../storage/LocalStore';
import type { SharedConfigStore } from '../storage/SharedConfigStore';
import type { Notify } from '../storage/storageTypes';
import type { VaultLayout } from '../storage/VaultLayout';
import { ChangeNotifier } from './changeListeners';
import type { HistoryManager } from './HistoryManager';
import type { SettingsReader } from './SettingsService';

/** The leading constructor arguments every data manager takes; the wiring layer spreads them. */
export type ManagerBase = [
	Vault, FileManager, EntryIndex, LocalStore, SharedConfigStore, () => VaultLayout, Notify, SettingsReader,
];

/** The stores a data manager reads and writes notes through. */
export abstract class EntryManagerBase extends ChangeNotifier {
	protected readonly vault: Vault;
	protected readonly fileManager: FileManager;
	protected readonly index: EntryIndex;
	protected readonly local: LocalStore;
	protected readonly shared: SharedConfigStore;
	protected readonly layout: () => VaultLayout;
	protected readonly notify: Notify;
	protected readonly appSettings: SettingsReader;
	protected historyManager: HistoryManager | null = null;

	protected constructor(...[vault, fileManager, index, local, shared, layout, notify, appSettings]: ManagerBase) {
		super();
		this.vault = vault;
		this.fileManager = fileManager;
		this.index = index;
		this.local = local;
		this.shared = shared;
		this.layout = layout;
		this.notify = notify;
		this.appSettings = appSettings;
	}

	setHistoryManager(hm: HistoryManager): void {
		this.historyManager = hm;
	}
}
