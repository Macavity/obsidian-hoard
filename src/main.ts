import { Notice, Plugin, parseYaml, stringifyYaml } from 'obsidian';
import { DEFAULT_SETTINGS, LAST_USED_TYPE_SENTINEL, HoardPluginSettings, setActiveDateFormat } from './types';
import type { HoardData } from './types';
import { DataManager } from './DataManager';
import { ReadingDataManager } from './ReadingDataManager';
import { GameDataManager } from './GameDataManager';
import { ApiService } from './ApiService';
import { HistoryManager } from './HistoryManager';
import { PosterService } from './PosterService';
import { VaultLayout } from './storage/VaultLayout';
import { LocalStore } from './storage/LocalStore';
import { SharedConfigStore } from './storage/SharedConfigStore';
import { EntryIndex } from './storage/EntryIndex';
import { HistoryStore } from './storage/HistoryStore';
import { hasHoardKey } from './storage/baseFile';
import { legacyRoot, migrateV1 } from './storage/migrateV1';
import { loadOwnOrOriginal, LEGACY_PLUGIN_IDS } from './storage/legacyPlugin';
import type { BackupManagers } from './backup';
import { composeSettings, persistSettings } from './settingsSplit';
import { resolveJikanEndpoint } from './jikanBase';

/** Root folder created on a fresh install (no `.base` with a `hoard:` key found). */
const DEFAULT_ROOT = 'Hoard';

export default class HoardPlugin extends Plugin {
	settings: HoardPluginSettings = DEFAULT_SETTINGS;
	// schema-1 data.json awaiting migration; LocalStore never writes data.json meanwhile
	private legacyData: HoardData | null = null;
	// folder of the original plugin when its data.json was adopted; backups go next to it
	private legacySourceDir: string | null = null;
	private indexReady = false;
	private typeNamesKey: string | null = null;
	private layout = new VaultLayout(DEFAULT_ROOT, () => this.settings.types.map((t) => t.name));
	private local = new LocalStore({
		loadData: async () => {
			const loaded = await loadOwnOrOriginal(() => this.loadData(), {
				configDir: this.app.vault.configDir,
				adapter: this.app.vault.adapter,
			});
			this.legacySourceDir = loaded.dir ?? null;
			return loaded.raw;
		},
		saveData: (d) => this.saveData(d),
	});
	private yaml = { parse: parseYaml, stringify: stringifyYaml };
	private shared = new SharedConfigStore(
		this.app,
		() => this.layout,
		this.yaml,
		(ref) => this.registerEvent(ref),
	);
	private index = new EntryIndex(this.app, () => this.layout, this.local, (ref) => this.registerEvent(ref));
	dataManager: DataManager = new DataManager(this, {
		index: this.index,
		local: this.local,
		shared: this.shared,
		layout: () => this.layout,
	});
	readingDataManager: ReadingDataManager = new ReadingDataManager(this, {
		index: this.index,
		local: this.local,
		shared: this.shared,
		layout: () => this.layout,
	});
	gameDataManager: GameDataManager = new GameDataManager(this, {
		index: this.index,
		local: this.local,
		shared: this.shared,
		layout: () => this.layout,
	});
	apiService: ApiService = new ApiService('', '');
	/** TMDB/OMDb key snapshot of the last settings save; null before onload set it */
	private apiKeys: string | null = null;
	historyManager: HistoryManager = new HistoryManager(this, new HistoryStore(
		this.app,
		() => this.layout,
		(ref) => this.registerEvent(ref),
	));
	posterService!: PosterService;

	// runtime import progress state (not persisted)
	importProgress: { current: number; total: number; cancel: () => void } | null = null;

	async onload(): Promise<void> {
		const loaded = await this.local.load();
		if (loaded.schema === 1) {
			// migrated in startVaultStorage, once the vault is ready; until then its settings act as local
			this.legacyData = loaded.legacy;
		} else if (loaded.schema === 'newer') {
			new Notice('Hoard: data.json was written by a newer plugin version. Device settings are not saved until you update.', 0);
		} else if (this.legacySourceDir !== null) {
			// a schema-2 data.json taken over from the original plugin: persist the copy as our own
			this.local.queueSave();
		}
		this.warnIfOriginalEnabled();
		// local + defaults only; shared keys are re-composed once the base is loaded (startVaultStorage)
		await this.loadSettings();

		this.apiService = new ApiService(
			this.settings.omdbApiKey,
			this.settings.tmdbApiKey,
			this.settings.googleBooksApiKey,
			this.settings.rawgApiKey,
			this.settings.igdbClientId,
			this.settings.igdbClientSecret,
			this.settings.steamApiKey,
			this.settings.steamId,
			resolveJikanEndpoint(this.settings.jikanBaseUrl),
		);
		this.apiKeys = [this.settings.tmdbApiKey, this.settings.omdbApiKey].join('\n');
		this.dataManager.setHistoryManager(this.historyManager);
		this.readingDataManager.setHistoryManager(this.historyManager);
		this.gameDataManager.setHistoryManager(this.historyManager);
		// history binds first so any reading-load logging has a live target
		await this.historyManager.load();

		this.posterService = new PosterService(
			this.dataManager,
			() => this.settings,
		);

		// notes are read once the vault and metadata cache are ready
		this.app.workspace.onLayoutReady(() => void this.startVaultStorage());
	}

	onunload(): void {
		// synchronously flush pending debounced saves so no in-memory edits are lost
		this.dataManager.flushPendingSaveSync();
		this.dataManager.flushPosterSaveSync();
		this.dataManager.flushQueuedSaveSync();
		const flushes = [this.readingDataManager?.flushPending(), this.gameDataManager?.flushPending()];
		this.posterService?.destroy();
		this.index.stop();
		this.shared.stop();
		// local state last: the note flushes above may still touch it
		void Promise.allSettled(flushes).then(() => this.local.flush());
	}

	/**
	 * Locates the root (folder of the first `.base` with a `hoard:` key), creates the base on a
	 * fresh install, loads the shared config and builds the entry index from the notes.
	 */
	private async startVaultStorage(): Promise<void> {
		try {
			const root = await this.findRoot();
			const legacy = this.legacyData;
			this.layout = new VaultLayout(
				root ?? (legacy ? legacyRoot(legacy) : DEFAULT_ROOT),
				() => this.settings.types.map((t) => t.name),
			);
			if (legacy) await this.migrate(legacy);
			if (root === null && !legacy) {
				// fresh install (or base not synced yet): no base until the first write; a synced one is adopted
				this.shared.deferBase({
					create: async () => {
						await this.dataManager.ensureFolder(this.layout.root);
						await this.shared.createBase(this.settings as unknown as Record<string, unknown>);
					},
					appeared: () => this.adoptSyncedBase(),
				});
				this.index.onLocalWrite(() => void this.shared.ensureBase().catch((e) => console.error('[Hoard] could not create the base', e)));
			}
			await this.shared.load();
			await this.applySharedSettings();
			this.shared.onChange(() => void this.applySharedSettings());
			if (root !== null && (await this.shared.ensureFilter()) === 'missing') {
				new Notice('Hoard: the folder filter in Hoard.base was not found; the base view may list other notes.');
			}
			this.shared.start();
			await this.index.build();
			this.index.sweepCache();
			this.indexReady = true;
			this.index.start();
			await this.historyManager.start();
			await this.dataManager.init();
			await this.readingDataManager.init();
			await this.gameDataManager.init();
			await this.dataManager.ensureFolders();
		} catch (e) {
			console.error('[Hoard] vault storage failed to start', e);
			new Notice('Hoard could not load its notes. See the developer console for details.');
		}
	}

	/** A base appeared by sync after startup: take over its root and settings, then rebuild and refresh. */
	private async adoptSyncedBase(): Promise<void> {
		try {
			const root = await this.findRoot();
			if (root !== null) {
				this.layout = new VaultLayout(root, () => this.settings.types.map((t) => t.name));
			}
			await this.shared.load();
			await this.applySharedSettings();
			await this.shared.ensureFilter();
			await this.index.rebuild();
			activeDocument.dispatchEvent(new CustomEvent('hoard-data-changed'));
		} catch (e) {
			console.error('[Hoard] could not adopt the synced base', e);
		}
	}

	/** Type names drive classification: a change (local or synced) needs a re-scan of all notes. */
	private syncTypeNames(): void {
		const key = this.settings.types.map((t) => t.name).join('\n');
		const changed = this.typeNamesKey !== null && key !== this.typeNamesKey;
		this.typeNamesKey = key;
		if (!changed || !this.indexReady) return;
		void this.index.rebuild().then(() => activeDocument.dispatchEvent(new CustomEvent('hoard-data-changed')));
	}

	/** Both plugins manage the same folders; the original would keep writing from its own data.json. */
	private warnIfOriginalEnabled(): void {
		const plugins = (this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
		if (LEGACY_PLUGIN_IDS.some((id) => plugins?.enabledPlugins?.has(id))) {
			new Notice('A predecessor of this plugin is still enabled. Disable it, otherwise both plugins write the same notes.', 0);
		}
	}

	/** Moves a schema-1 data.json into notes, base and History.md; on failure it is retried next start. */
	private async migrate(legacy: HoardData): Promise<void> {
		const report = await migrateV1({
			app: this.app,
			plugin: { manifest: { dir: this.legacySourceDir ?? this.manifest.dir } },
			local: this.local,
			legacy,
			shared: this.shared,
			history: new HistoryStore(this.app, () => this.layout),
			yaml: this.yaml,
			layout: this.layout,
		});
		if (report.skipped.length > 0) console.warn('[Hoard] migration skipped', report.skipped);
		if (report.errors.length > 0) {
			console.error('[Hoard] migration failed; data.json is kept and the migration retried next start', report.errors);
			new Notice('Hoard could not migrate its data to notes. It will retry on the next start; see the developer console.', 0);
			return;
		}
		this.legacyData = null;
		await this.loadSettings();
		const skipped = report.skipped.length > 0 ? ` ${report.skipped.length} item(s) were skipped, see the developer console.` : '';
		new Notice(`Hoard moved its data into notes (backup: data.v1-backup.json).${skipped}`, 10000);
	}

	/** Everything backup export and restore need. */
	backupManagers(): BackupManagers {
		return {
			dataManager: this.dataManager,
			readingDataManager: this.readingDataManager,
			gameDataManager: this.gameDataManager,
			historyManager: this.historyManager,
			storage: {
				local: this.local,
				shared: this.shared,
				importContext: () => ({
					app: this.app,
					local: this.local,
					shared: this.shared,
					history: new HistoryStore(this.app, () => this.layout),
					yaml: this.yaml,
					layout: this.layout,
				}),
			},
		};
	}

	/** Current vault layout (root and central folders). */
	getLayout(): VaultLayout {
		return this.layout;
	}

	/** Re-composes settings from the (re)loaded base, then refreshes derived state and views. */
	private async applySharedSettings(): Promise<void> {
		await this.loadSettings();
		activeDocument.dispatchEvent(new CustomEvent('hoard-data-changed'));
	}

	private async findRoot(): Promise<string | null> {
		const { vault } = this.app;
		const bases = await Promise.all(
			vault.getFiles()
				.filter((f) => f.extension === 'base')
				.map(async (f) => ({ path: f.path, hasHoardKey: hasHoardKey(await vault.cachedRead(f)) })),
		);
		return VaultLayout.findRoot(bases);
	}

	/** Composes settings from defaults, data.json and the shared base (shared keys win). */
	loadSettings(): Promise<void> {
		// a schema-1 data.json is not adopted yet: its settings are the local part until migration
		const localSettings = this.legacyData?.settings ?? this.local.data.settings;
		this.settings = composeSettings(
			localSettings,
			this.shared.get().settings,
		);
		// mirror into types.ts so the pure formatters render in the chosen order without a settings ref
		setActiveDateFormat(this.settings.dateFormat);
		this.syncTypeNames();
		// a restored backup can bring another endpoint; PosterService reads it per request anyway
		this.apiService.setJikanEndpoint(resolveJikanEndpoint(this.settings.jikanBaseUrl));
		return Promise.resolve();
	}

	async saveSettings(): Promise<void> {
		// keep the date formatters in step with the setting on every save
		setActiveDateFormat(this.settings.dateFormat);
		this.syncTypeNames();
		// a changed key makes "no key" checks worth repeating
		const keys = [this.settings.tmdbApiKey, this.settings.omdbApiKey].join('\n');
		if (this.apiKeys !== null && keys !== this.apiKeys) this.dataManager.resetNoKeyChecks();
		this.apiKeys = keys;
		await persistSettings(this.settings, this.local, this.shared);
	}

	/**
	 * Type slug the Add modal preselects. The sentinel → the last added type if it still exists, else
	 * the first available; a real, still-existing type → itself; otherwise the first available. Never
	 * returns a non-existent type while at least one exists.
	 */
	resolveDefaultAddType(): string {
		const types = this.settings.types ?? [];
		const firstAvailable = types[0]?.name ?? '';
		const exists = (name: string): boolean => !!name && types.some((t) => t.name === name);
		const choice = this.settings.defaultAddType ?? LAST_USED_TYPE_SENTINEL;
		if (choice === LAST_USED_TYPE_SENTINEL) {
			return exists(this.settings.lastAddedType) ? this.settings.lastAddedType : firstAvailable;
		}
		return exists(choice) ? choice : firstAvailable;
	}
}
