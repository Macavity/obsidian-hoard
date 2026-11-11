import { App, Editor, FuzzySuggestModal, Notice, Platform, Plugin, getLanguage, parseYaml, setIcon, stringifyYaml } from 'obsidian';
import { setLocale, t } from './i18n';
import { statusLabel, typeLabel } from './i18n/labels';
import type { ManagerNotice } from './storage/storageTypes';
import { DEFAULT_SETTINGS, LAST_USED_TYPE_SENTINEL, HoardPluginSettings, setActiveDateFormat } from './types';
import { cardSizeToMinWidth } from './VirtualGrid';
import type { CardStyleTab } from './types';
import { DataManager } from './DataManager';
import { ReadingDataManager } from './ReadingDataManager';
import { GameDataManager } from './GameDataManager';
import { ApiService } from './ApiService';
import { HistoryManager } from './HistoryManager';
import { PosterService } from './PosterService';
import { VaultLayout, detectRoot } from './storage/VaultLayout';
import { LocalStore } from './storage/LocalStore';
import { SecretStore, shouldShowSecretsNotice } from './storage/SecretStore';
import { SharedConfigStore } from './storage/SharedConfigStore';
import { EntryIndex } from './storage/EntryIndex';
import { HistoryStore } from './storage/HistoryStore';
import { HoardView, HOARD_VIEW_TYPE, TabName } from './HoardView';
import { AddTitleModal } from './AddTitleModal';
import { TitleDetailModal } from './TitleDetailModal';
import { InsertWidgetModal } from './InsertWidgetModal';
import { WidgetRenderer } from './WidgetRenderer';
import { HoardSettingsTab } from './SettingsTab';
import { AirtimeTab } from './AirtimeTab';
import { runAirtimeScheduler } from './airtimeScheduler';
import type { BackupManagers } from './backup';
import { WatchLogOnboardingModal } from './WatchLogOnboardingModal';
import { detectWatchLogSources } from './import/watchlog/detect';
import type { WatchLogSourceKind, WatchLogSources } from './import/watchlog/detect';
import { createImporter } from './import/watchlog/importer';
import { getDecision, pendingSources } from './import/watchlog/onboardingState';
import { composeSettings, persistSettings } from './settingsSplit';
import { resolveJikanEndpoint } from './jikanBase';

/** Root folder created on a fresh install (no `.base` with a `hoard:` key found). */
const DEFAULT_ROOT = 'Hoard';

export default class HoardPlugin extends Plugin {
	settings: HoardPluginSettings = DEFAULT_SETTINGS;
	private indexReady = false;
	private wizardOpen = false;
	private typeNamesKey: string | null = null;
	private layout = new VaultLayout(DEFAULT_ROOT, () => this.settings.types.map((t) => t.name));
	private secretStore = new SecretStore(this.app.secretStorage);
	private local = new LocalStore({
		loadData: () => this.loadData(),
		saveData: (d) => this.saveData(d),
	}, this.secretStore);
	private yaml = { parse: parseYaml, stringify: stringifyYaml };
	private shared = new SharedConfigStore(
		this.app,
		() => this.layout,
		this.yaml,
		(ref) => this.registerEvent(ref),
		(n) => this.notifyManager(n),
	);
	private index = new EntryIndex(this.app, () => this.layout, this.local, (ref) => this.registerEvent(ref));
	dataManager: DataManager = new DataManager(this, {
		index: this.index,
		local: this.local,
		shared: this.shared,
		layout: () => this.layout,
		notify: (n) => this.notifyManager(n),
	});
	readingDataManager: ReadingDataManager = new ReadingDataManager(this, {
		index: this.index,
		local: this.local,
		shared: this.shared,
		layout: () => this.layout,
		notify: (n) => this.notifyManager(n),
	});
	gameDataManager: GameDataManager = new GameDataManager(this, {
		index: this.index,
		local: this.local,
		shared: this.shared,
		layout: () => this.layout,
		notify: (n) => this.notifyManager(n),
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
	widgetRenderer?: WidgetRenderer;

	// runtime import progress state (not persisted)
	importProgress: { current: number; total: number; cancel: () => void } | null = null;

	// which entry+day combos have already fired a notification
	private notifiedEntries: Set<string> = new Set();

	// status-bar Upcoming "due" counter (desktop only; null on mobile)
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		setLocale(getLanguage());
		const loaded = await this.local.load();
		if (loaded.schema === 'newer') {
			new Notice(t('app.notices.newerSchema'), 0);
		} else if (loaded.schema === 'watchlog') {
			// device settings (API keys) would vanish on restart without a word
			new Notice(t('app.notices.watchLogData'), 0);
		}
		// local + defaults only; shared keys are re-composed once the base is loaded (startVaultStorage)
		await this.loadSettings();
		this.maybeShowSecretsNotice();
		// the card-size CSS var must be live before any view or modal renders a grid
		this.applyCardSizeCssVar();
		this.register(() => activeDocument.body.style.removeProperty('--hoard-card-minimum-width'));

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
			() => this.apiService,
		);

		this.startAirtimeScheduler();
		// notes are read once the vault and metadata cache are ready
		this.app.workspace.onLayoutReady(() => void this.startVaultStorage());

		this.registerView(HOARD_VIEW_TYPE, (leaf) => {
			return new HoardView(leaf, this, this.dataManager);
		});

		this.widgetRenderer = new WidgetRenderer(this, this.dataManager);

		this.addRibbonIcon('tv', t('app.ribbon'), () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-panel',
			name: t('app.commands.openPanel'),
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: 'add-title',
			name: t('app.commands.addTitle'),
			callback: () => {
				new AddTitleModal(this.app, this, this.dataManager, (entry) => {
					// setting off = just reveal whatever tab was open, no modal
					if (!(this.settings.openWatchlistAfterAdd ?? true)) {
						void this.activateView();
						return;
					}
					void this.activateView('watchlist').then(() => {
						// re-read: addTitle may have forced "To be released"
						const fresh = this.dataManager.getTitle(entry.id) ?? entry;
						new TitleDetailModal(this.app, this, fresh).open();
					});
				}).open();
			},
		});

		this.addCommand({
			id: 'insert-widget',
			name: t('app.commands.insertWidget'),
			editorCallback: (editor: Editor) => {
				this.openWidgetPalette(editor);
			},
		});

		this.addCommand({
			id: 'search-title',
			name: t('app.commands.searchTitle'),
			callback: () => {
				const titles = this.dataManager.getTitles();
				new InsertWidgetModal(this.app, titles, (title) => {
					void this.activateView().then(() => {
						new Notice(t('app.titleNotice', { title: title.title, type: typeLabel(title.type), status: statusLabel(title.status) }));
					});
				}).open();
			},
		});

		this.addSettingTab(new HoardSettingsTab(this.app, this));

		this.setupStatusBar();
		// keep the status bar in sync with data edits (no new timer: the 60s airtime interval drives the
		// time-based refresh). 'hoard-data-changed' is a custom event, so register the listener directly.
		const statusBarListener = (): void => this.updateStatusBar();
		activeDocument.addEventListener('hoard-data-changed', statusBarListener);
		this.register(() => activeDocument.removeEventListener('hoard-data-changed', statusBarListener));
	}

	/** Renders a manager notice in the active language. */
	notifyManager(n: ManagerNotice): void {
		const { code, ...params } = n;
		new Notice(t(`notices.manager.${code}`, params));
	}

	onunload(): void {
		// synchronously flush pending debounced saves so no in-memory edits are lost
		this.dataManager.flushPendingSaveSync();
		this.dataManager.flushPosterSaveSync();
		this.dataManager.flushQueuedSaveSync();
		const flushes = [this.readingDataManager?.flushPending(), this.gameDataManager?.flushPending()];
		this.posterService?.destroy();
		this.widgetRenderer?.cleanup();
		this.index.stop();
		this.shared.stop();
		// local state last: the note flushes above may still touch it
		void Promise.allSettled(flushes).then(() => this.local.flush());
	}

	/**
	 * Locates the root (folder of the first `.base` with a `hoard:`
	 * key), defers the base on a fresh install, loads the shared config and builds the entry index.
	 */
	private async startVaultStorage(): Promise<void> {
		try {
			let root = await detectRoot(this.app.vault);
			this.layout = new VaultLayout(root ?? DEFAULT_ROOT, () => this.settings.types.map((t) => t.name));
			if (root === null) {
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
			// the WatchLog import may create the base: take over its root before indexing
			await this.runOnboarding({ force: false });
			// also after a failed run: an import may have written the base before it broke
			root = (await detectRoot(this.app.vault)) ?? root;
			this.shared.onChange(() => void this.applySharedSettings());
			if (root !== null && (await this.shared.ensureFilter()) === 'missing') {
				const name = this.shared.baseFile()?.name ?? 'Hoard.base';
				new Notice(t('app.notices.baseFilterMissing', { file: name }));
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
			new Notice(t('app.notices.loadFailed'));
		}
	}

	/** True while the WatchLog onboarding wizard is open (the view shows a placeholder). */
	get importRunning(): boolean {
		return this.wizardOpen;
	}

	/**
	 * Opens the onboarding wizard when WatchLog data awaits a decision (or always with `force`).
	 * Returns whether it ran; a failure never blocks Hoard's start.
	 */
	private async runOnboarding(opts: { force: boolean; startAt?: 'found' | 'cleanup' }): Promise<boolean> {
		try {
			const sources = await detectWatchLogSources(this.app);
			if (!opts.force && pendingSources(this.local, sources).length === 0) return false;
			await this.openWizard(sources, opts.startAt);
			return true;
		} catch (e) {
			console.error('[Hoard] WatchLog onboarding failed', e);
			return false;
		}
	}

	private async openWizard(sources: WatchLogSources, startAt?: 'found' | 'cleanup'): Promise<void> {
		const kinds: WatchLogSourceKind[] = ['original', 'fork'];
		const imported = startAt === 'cleanup' ? kinds.filter((k) => getDecision(this.local, k) === 'imported') : undefined;
		const importer = createImporter({
			app: this.app,
			local: this.local,
			ctx: () => this.backupManagers().storage.importContext(),
			layout: () => this.layout,
			openFile: (path) => {
				const file = this.app.vault.getFileByPath(path);
				if (file) void this.app.workspace.getLeaf('tab').openFile(file);
			},
		}, sources);
		this.wizardOpen = true;
		try {
			const modal = new WatchLogOnboardingModal(this.app, importer, { startAt, imported });
			modal.open();
			// views listen on the data manager: show the "import running" placeholder
			this.dataManager.notifyChange();
			await modal.finished;
			// before the views render again, so they see the imported settings
			await this.adoptImportedData().catch((e: unknown) => {
				console.error('[Hoard] could not apply the imported data', e);
				new Notice(t('onboarding.adoptFailed'));
			});
		} finally {
			this.wizardOpen = false;
			this.dataManager.notifyChange();
		}
	}

	/** The import may have written the base and device settings: re-detect the root, reload, refresh views. */
	private async adoptImportedData(): Promise<void> {
		const root = await detectRoot(this.app.vault);
		if (root !== null) this.layout = new VaultLayout(root, () => this.settings.types.map((t) => t.name));
		await this.shared.load();
		await this.applySharedSettings();
	}

	/** Settings entry: re-runs the wizard (ignoring earlier decisions) on the found sources or the cleanup step. */
	async openWatchLogImport(startAt: 'found' | 'cleanup' = 'found'): Promise<void> {
		if (this.wizardOpen) return;
		const sources = await detectWatchLogSources(this.app);
		if (!sources.original && !sources.fork) {
			new Notice(t('onboarding.none'));
			return;
		}
		this.index.stop();
		try {
			await this.openWizard(sources, startAt);
		} finally {
			await this.index.rebuild();
			this.index.start();
			activeDocument.dispatchEvent(new CustomEvent('hoard-data-changed'));
		}
	}

	/** A base appeared by sync after startup: take over its root and settings, then rebuild and refresh. */
	private async adoptSyncedBase(): Promise<void> {
		try {
			const root = await detectRoot(this.app.vault);
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
		this.applyCardSizeCssVar();
		activeDocument.dispatchEvent(new CustomEvent('hoard-data-changed'));
	}

	private startAirtimeScheduler(): void {
		this.checkAirtimeNotifications();
		this.registerInterval(window.setInterval(() => {
			this.checkAirtimeNotifications();
		}, 60000));
	}

	/** Lets AirtimeTab prevent the scheduler from double-firing after a manual tick. */
	markAirtimeHandled(key: string): void {
		this.notifiedEntries.add(key);
	}

	private checkAirtimeNotifications(): void {
		runAirtimeScheduler({
			dataManager: this.dataManager,
			readingDataManager: this.readingDataManager,
			gameDataManager: this.gameDataManager,
			notify: (name) => new Notice(name, 8000),
		}, this.notifiedEntries);

		// the due count is time-based, so refresh the status bar on every tick
		this.updateStatusBar();
	}

	// Status bar: Upcoming "due" counter
	private setupStatusBar(): void {
		// the status bar doesn't exist on mobile: skip entirely there
		if (Platform.isMobile) return;
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass('hoard-statusbar');
		this.statusBarEl.setAttribute('aria-label', t('app.statusBar.label'));
		this.statusBarEl.addEventListener('click', () => void this.activateView('upcoming'));
		this.updateStatusBar();
	}

	/** Refreshes the status-bar Upcoming counter. Hidden when off or when 0 due. */
	updateStatusBar(): void {
		const el = this.statusBarEl;
		if (!el) return;
		if (!this.settings.showUpcomingStatusBar) {
			el.hide();
			return;
		}
		const count =
			AirtimeTab.getAiredDueCount(this.dataManager, this.readingDataManager, this.gameDataManager) +
			AirtimeTab.getMaybeDueCount(this.dataManager);
		if (count <= 0) {
			el.hide();
			return;
		}
		el.empty();
		el.show();
		// orange icon + "N due" (colour from .hoard-statusbar), reusing the ribbon's 'tv' icon
		const icon = el.createSpan({ cls: 'hoard-statusbar__icon' });
		setIcon(icon, 'tv');
		el.createSpan({ cls: 'hoard-statusbar__text', text: t('app.statusBar.due', { count }) });
	}

	/**
	 * Minimum card width (px) for every poster/cover grid and shelf, from the card-size step for this
	 * device class (desktop vs mobile).
	 */
	getCardMinWidth(): number {
		return cardSizeToMinWidth(
			Platform.isMobile ? this.settings.cardSizeMobile : this.settings.cardSize,
		);
	}

	/**
	 * Whether a tab's poster cards show their text under the poster (the per-tab cardTextStyles
	 * setting; 'under' is the default for data saved before it existed).
	 */
	isCardTextUnder(tab: CardStyleTab): boolean {
		return this.settings.cardTextStyles?.[tab] !== 'inside';
	}

	/**
	 * Publish the resolved card size as a body-level CSS var, so the plain-CSS grids (detail-modal
	 * member grids, non-virtual fallbacks) track the setting too. Called on load and on every change.
	 */
	applyCardSizeCssVar(): void {
		activeDocument.body.style.setProperty('--hoard-card-minimum-width', `${this.getCardMinWidth()}px`);
	}

	/** Keys do not sync between devices: tell a migrated device once that its keychain is empty. */
	private maybeShowSecretsNotice(): void {
		const shown = this.app.loadLocalStorage('hoard-secrets-notice') === true;
		if (!shouldShowSecretsNotice(this.local.data.secretsInStorage === true, this.secretStore.isEmpty(), shown)) return;
		new Notice(t('app.notices.secretsPerDevice'), 0);
		this.app.saveLocalStorage('hoard-secrets-notice', true);
	}

	/** Composes settings from defaults, data.json and the shared base (shared keys win). */
	loadSettings(): Promise<void> {
		this.settings = composeSettings(this.local.data.settings, this.shared.get().settings, this.secretStore.read());
		// mirror into types.ts so the pure formatters render in the chosen order without a settings ref
		setActiveDateFormat(this.settings.dateFormat);
		this.syncTypeNames();
		// a restored backup or a WatchLog import can bring other keys and endpoints
		this.applyApiKeys();
		return Promise.resolve();
	}

	/** Pushes the composed keys into the API service; a changed key makes "no key" checks worth repeating. */
	private applyApiKeys(): void {
		const s = this.settings;
		const api = this.apiService;
		api.setJikanEndpoint(resolveJikanEndpoint(s.jikanBaseUrl));
		api.setOmdbKey(s.omdbApiKey);
		api.setTmdbKey(s.tmdbApiKey);
		api.setGoogleBooksKey(s.googleBooksApiKey);
		api.setRawgKey(s.rawgApiKey);
		api.setIgdbCredentials(s.igdbClientId, s.igdbClientSecret);
		api.setSteamCredentials(s.steamApiKey, s.steamId);
		const keys = [s.tmdbApiKey, s.omdbApiKey].join('\n');
		if (this.apiKeys !== null && keys !== this.apiKeys) this.dataManager.resetNoKeyChecks();
		this.apiKeys = keys;
	}

	async saveSettings(): Promise<void> {
		// keep the date formatters in step with the setting on every save
		setActiveDateFormat(this.settings.dateFormat);
		this.syncTypeNames();
		this.applyApiKeys();
		await persistSettings(this.settings, this.local, this.shared, this.secretStore);
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

	private openWidgetPalette(editor: Editor): void {
		const widgets = [
			{ name: `hoard-todo: ${t('app.widgets.todoFull')}`, id: 'hoard-todo' },
			{ name: `hoard-todo mini: ${t('app.widgets.todoMini')}`, id: 'hoard-todo:mini' },
			{ name: `hoard-stat: watched: ${t('app.widgets.statWatched')}`, id: 'hoard-stat:watched' },
			{ name: `hoard-stat: completed: ${t('app.widgets.statCompleted')}`, id: 'hoard-stat:completed' },
			{ name: `hoard-stat: remaining: ${t('app.widgets.statRemaining')}`, id: 'hoard-stat:remaining' },
			{ name: `hoard-stat: time: ${t('app.widgets.statTime')}`, id: 'hoard-stat:time' },
			{ name: `hoard-upcoming: next: ${t('app.widgets.upcomingNext')}`, id: 'hoard-upcoming:next' },
			{ name: `hoard-stat: time completed full: ${t('app.widgets.statTimeCompletedFull')}`, id: 'hoard-stat:time completed full' },
			{ name: `hoard-now-next: ${t('app.widgets.nowNext')}`, id: 'hoard-now-next' },
		];

		new WidgetSelectModal(this.app, widgets, (selected) => {
			if (selected.id === 'hoard-todo' || selected.id === 'hoard-todo:mini') {
				const titles = this.dataManager.getTitles();
				if (titles.length === 0) {
					new Notice(t('app.notices.noTitles'));
					return;
				}
				const isMini = selected.id === 'hoard-todo:mini';
				new InsertWidgetModal(this.app, titles, (title) => {
					if (isMini) {
						editor.replaceSelection(`\`\`\`hoard-todo\n${title.title}\nmini\n\`\`\``);
					} else {
						editor.replaceSelection(`\`\`\`hoard-todo\n${title.title}\n\`\`\``);
					}
				}).open();
			} else if (selected.id === 'hoard-stat:watched') {
				editor.replaceSelection('```hoard-stat\nwatched\n```');
			} else if (selected.id === 'hoard-stat:completed') {
				editor.replaceSelection('```hoard-stat\ncompleted\n```');
			} else if (selected.id === 'hoard-stat:remaining') {
				editor.replaceSelection('```hoard-stat\nremaining\n```');
			} else if (selected.id === 'hoard-stat:time') {
				editor.replaceSelection('```hoard-stat\ntime\n```');
			} else if (selected.id === 'hoard-upcoming:next') {
				editor.replaceSelection('```hoard-upcoming\nnext\n```');
			} else if (selected.id === 'hoard-stat:time completed full') {
				editor.replaceSelection('```hoard-stat\ntime completed full\n```');
			} else if (selected.id === 'hoard-now-next') {
				editor.replaceSelection('```hoard-now-next\n```');
			}
		}).open();
	}

	private async activateView(tab?: TabName): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(HOARD_VIEW_TYPE);
		if (existing.length > 0) {
			const leaf = existing[0]!;
			void workspace.revealLeaf(leaf);
			if (tab && leaf.view instanceof HoardView) leaf.view.setActiveTab(tab);
			return;
		}

		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ type: HOARD_VIEW_TYPE, active: true });
		void workspace.revealLeaf(leaf);
		if (tab && leaf.view instanceof HoardView) leaf.view.setActiveTab(tab);
	}
}

// Widget selection modal

interface WidgetItem { name: string; id: string; }

class WidgetSelectModal extends FuzzySuggestModal<WidgetItem> {
	private items: WidgetItem[];
	private onSelect: (item: WidgetItem) => void;

	constructor(app: App, items: WidgetItem[], onSelect: (item: WidgetItem) => void) {
		super(app);
		this.items = items;
		this.onSelect = onSelect;
		this.setPlaceholder(t('app.widgetPlaceholder'));
	}

	getItems(): WidgetItem[] { return this.items; }
	getItemText(item: WidgetItem): string { return item.name; }
	onChooseItem(item: WidgetItem): void { this.onSelect(item); }
}
