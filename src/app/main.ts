import { App, Editor, FuzzySuggestModal, Notice, Platform, Plugin, getLanguage, parseYaml, setIcon, stringifyYaml } from 'obsidian';
import { CoverRefresher, resolveGameCover, fetchReadingCoverById, firstBookCover, searchBooks } from '../shared/services/coverRefresh';
import { CustomListManager } from '../modules/custom-lists/services/CustomListManager';
import { setLocale, t } from '../shared/i18n';
import { statusLabel, typeLabel } from '../shared/i18n/labels';
import type { ManagerNotice } from '../shared/storage/storageTypes';
import type { HoardPluginSettings } from '../modules/settings/domain/model';
import { setActiveDateFormat } from '../shared/domain/date';
import { DEFAULT_SETTINGS } from '../modules/settings/domain/settingsDefaults';
import { cardSizeToMinWidth } from '../design-system/VirtualGrid';
import type { CustomList } from '../modules/custom-lists/domain/customList';
import type { CardStyleTab } from '../modules/settings/domain/model';
import type { ImportProgress } from '../modules/watchlist/domain/model';
import { DataManager } from '../modules/watchlist/services/DataManager';
import { ReadingDataManager } from '../modules/reading/services/ReadingDataManager';
import { GameDataManager } from '../modules/games/services/GameDataManager';
import { ApiService } from '../shared/api/ApiService';
import { HistoryManager } from '../shared/services/HistoryManager';
import { PosterService } from '../shared/api/PosterService';
import { VaultLayout, detectRoot } from '../shared/storage/VaultLayout';
import { LocalStore } from '../shared/storage/LocalStore';
import { SecretStore, shouldShowSecretsNotice } from '../shared/storage/SecretStore';
import { SharedConfigStore } from '../shared/storage/SharedConfigStore';
import { EntryIndex } from '../shared/storage/EntryIndex';
import { HistoryStore } from '../shared/storage/HistoryStore';
import { HoardView, HOARD_VIEW_TYPE, TabName } from './HoardView';
import { watchlistUi, type WatchlistUi } from './wiring/watchlist';
import { readingUi, type ReadingUi } from './wiring/reading';
import { gamesUi, type GamesUi } from './wiring/games';
import { airtimeUi, type AirtimeUi } from './wiring/airtime';
import { customListsUi, type CustomListsUi } from './wiring/customLists';
import { draftsUi, type DraftsUi } from './wiring/drafts';
import { logUi, type LogUi } from './wiring/log';
import { dashboardUi, type DashboardUi } from './wiring/dashboard';
import { settingsUi } from './wiring/settings';
import { hoardTabs } from './wiring/tabs';
import { addRouteUi } from './wiring/addRoute';
import { addUi } from './wiring/add';
import type { AddDone, AddProvider } from '../modules/add/exports';
import { InsertWidgetModal } from '../modules/widgets/ui/InsertWidgetModal';
import { WidgetRenderer } from '../modules/widgets/ui/WidgetRenderer';
import { runAirtimeScheduler } from '../modules/airtime/services/airtimeScheduler';
import type { BackupManagers } from '../modules/backup/services/backup';
import { composeSettings, persistSettings } from '../modules/settings/services/settingsSplit';
import { toRecord } from '../shared/domain/sharedHelpers';
import { resolveJikanEndpoint } from '../shared/api/jikanBase';
import { emitDataChanged, onDataChanged } from '../shared/services/changeSignal';
import { SettingsService } from '../modules/settings/services/SettingsService';
import { EntryNotes } from '../shared/services/EntryNotes';

/** Root folder created on a fresh install (no `.base` with a `hoard:` key found). */
const DEFAULT_ROOT = 'Hoard';

export default class HoardPlugin extends Plugin {
	// a copy: lists edited in place before the first load must not change the defaults
	private state: HoardPluginSettings = structuredClone(DEFAULT_SETTINGS);
	/** The single settings access for everything else; `state` is only the plugin's own copy. */
	private readonly settingsService = new SettingsService(
		() => this.state,
		() => this.persistAll(),
		emitDataChanged,
	);
	private indexReady = false;
	private typeNamesKey: string | null = null;
	private layout = new VaultLayout(DEFAULT_ROOT, () => this.state.types.map((t) => t.name));
	private secretStore = new SecretStore(this.app.secretStorage);
	private local = new LocalStore({
		loadData: () => this.loadData(),
		saveData: (d) => this.saveData(d),
	}, this.secretStore);
	private yaml = { parse: parseYaml, stringify: stringifyYaml };
	private shared = new SharedConfigStore(
		this.app.vault,
		() => this.layout,
		this.yaml,
		(ref) => this.registerEvent(ref),
		(n) => this.notifyManager(n),
	);
	private index = new EntryIndex(this.app.vault, this.app.metadataCache, this.app.workspace, () => this.layout, this.local, (ref) => this.registerEvent(ref));
	private entryNotes = new EntryNotes(
		this.app.vault,
		this.app.fileManager,
		() => this.layout,
		(n) => this.notifyManager(n),
		(ref) => this.registerEvent(ref),
	);
	// the managers reach each other through lambdas, so the construction order does not matter
	private dataManager: DataManager = new DataManager(
		this.entryNotes,
		this.index,
		this.local,
		this.shared,
		(n) => this.notifyManager(n),
		this.settingsService,
		// apiService and posterService are replaced / created in onload
		{
			fetchAiring: (e) => this.apiService.fetchAiring(e),
			fetchSeasons: (t) => this.apiService.fetchSeasons(t),
		},
		() => this.posterService ?? null,
		{
			clearBookOrMangaReleaseDate: (kind, id) => this.readingDataManager.clearBookOrMangaReleaseDate(kind, id),
			clearGameReleaseDate: (id) => this.gameDataManager.clearGameReleaseDate(id),
		},
	);
	private readingDataManager: ReadingDataManager = new ReadingDataManager(
		this.entryNotes,
		this.index,
		this.local,
		this.shared,
		(n) => this.notifyManager(n),
		this.settingsService,
		{
			autoAddReadingToUpcoming: (item, kind) => this.dataManager.autoAddReadingToUpcoming(item, kind),
			removeReadingAirtimeEntries: (id) => this.dataManager.removeReadingAirtimeEntries(id),
		},
	);
	private gameDataManager: GameDataManager = new GameDataManager(
		this.entryNotes,
		this.index,
		this.local,
		this.shared,
		(n) => this.notifyManager(n),
		this.settingsService,
		{
			autoAddGameToUpcoming: (g) => this.dataManager.autoAddGameToUpcoming(g),
			removeGameAirtimeEntries: (id) => this.dataManager.removeGameAirtimeEntries(id),
		},
	);
	private apiService: ApiService = new ApiService('', '');
	/** TMDB/OMDb key snapshot of the last settings save; null before onload set it */
	private apiKeys: string | null = null;
	private historyManager: HistoryManager = new HistoryManager(new HistoryStore(
		this.app.vault,
		() => this.layout,
		(ref) => this.registerEvent(ref),
	));
	private posterService!: PosterService;
	private watchlist!: WatchlistUi;
	private reading!: ReadingUi;
	private games!: GamesUi;
	private airtime!: AirtimeUi;
	private customLists!: CustomListsUi;
	private drafts!: DraftsUi;
	private log!: LogUi;
	private dashboard!: DashboardUi;
	private coverRefresher!: CoverRefresher;
	private widgetRenderer?: WidgetRenderer;

	// runtime import progress state (not persisted)
	private importProgress: ImportProgress | null = null;

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
		this.register(() => window.document.body.setCssProps({ '--hoard-card-minimum-width': '' }));

		this.apiService = new ApiService(
			this.state.omdbApiKey,
			this.state.tmdbApiKey,
			this.state.googleBooksApiKey,
			this.state.rawgApiKey,
			this.state.igdbClientId,
			this.state.igdbClientSecret,
			this.state.steamApiKey,
			this.state.steamId,
			resolveJikanEndpoint(this.state.jikanBaseUrl),
		);
		this.apiKeys = [this.state.tmdbApiKey, this.state.omdbApiKey].join('\n');
		this.dataManager.setHistoryManager(this.historyManager);
		this.readingDataManager.setHistoryManager(this.historyManager);
		this.gameDataManager.setHistoryManager(this.historyManager);
		// history binds first so any reading-load logging has a live target
		await this.historyManager.load();

		this.posterService = new PosterService(
			this.dataManager,
			() => this.settingsService.get(),
			() => this.apiService,
		);
		this.coverRefresher = new CoverRefresher(
			this.apiService,
			this.dataManager,
			this.posterService,
			this.readingDataManager,
			this.gameDataManager,
			this.dataManager.apiQueue,
		);

		const host = {
			getCardMinWidth: () => this.getCardMinWidth(),
			isCardTextUnder: (tab: CardStyleTab) => this.isCardTextUnder(tab),
			importProgress: () => this.importProgress,
		};
		// the wizard reads its providers when it opens, so the tabs below can hold `openAddWizard` before they exist
		const addProviders: AddProvider[] = [];
		const { openAddWizard } = addUi({ app: this.app, providers: () => addProviders });
		this.watchlist = watchlistUi({
			app: this.app,
			settings: this.settingsService,
			titles: this.dataManager,
			api: this.apiService,
			posters: this.posterService,
			history: this.historyManager,
			host,
			openAddWizard,
		});
		this.reading = readingUi({
			app: this.app,
			settings: this.settingsService,
			reading: this.readingDataManager,
			api: this.apiService,
			history: this.historyManager,
			searchBooks,
			covers: { searchBooks, fetchReadingCoverById, firstBookCover },
			host,
		});
		this.games = gamesUi({
			app: this.app,
			settings: this.settingsService,
			games: this.gameDataManager,
			api: this.apiService,
			resolveGameCover,
			host,
		});
		this.airtime = airtimeUi({
			app: this.app,
			settings: this.settingsService,
			titles: this.dataManager,
			reading: this.readingDataManager,
			games: this.gameDataManager,
			api: this.apiService,
			posters: this.posterService,
			host: { ...host, markAirtimeHandled: (key) => this.markAirtimeHandled(key) },
			openAddWizard,
		});
		addProviders.push(this.watchlist.addProvider);
		const openAdd = addRouteUi({
			app: this.app,
			openAddWizard,
			openAddReading: this.reading.openAddReading,
			openAddGame: this.games.openAddGame,
		});
		this.customLists = customListsUi({
			app: this.app,
			settings: this.settingsService,
			createListManager: this.listManager,
			titles: this.dataManager,
			reading: this.readingDataManager,
			games: this.gameDataManager,
			openAdd,
		});
		this.log = logUi({ app: this.app, history: this.historyManager });
		this.dashboard = dashboardUi({
			settings: this.settingsService,
			titles: this.dataManager,
			reading: this.readingDataManager,
			games: this.gameDataManager,
		});
		this.drafts = draftsUi({
			app: this.app,
			settings: this.settingsService,
			titles: this.dataManager,
			reading: this.readingDataManager,
			games: this.gameDataManager,
			openAdd,
		});

		this.startAirtimeScheduler();
		// notes are read once the vault and metadata cache are ready
		this.app.workspace.onLayoutReady(() => void this.startVaultStorage());

		const tabs = hoardTabs({
			dashboard: this.dashboard,
			watchlist: this.watchlist,
			airtime: this.airtime,
			reading: this.reading,
			games: this.games,
			customLists: this.customLists,
			drafts: this.drafts,
			log: this.log,
		});
		this.registerView(HOARD_VIEW_TYPE, (leaf) => new HoardView(
			leaf,
			this.settingsService,
			this.dataManager,
			this.app.metadataCache,
			tabs,
		));

		this.widgetRenderer = new WidgetRenderer(
			this.settingsService,
			this.dataManager,
			(language, handler) => this.registerMarkdownCodeBlockProcessor(language, handler),
			(cleanup) => this.register(cleanup),
		);

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
				openAddWizard({ onAdded: (done) => { void this.revealAdded(done); } });
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
				new InsertWidgetModal(this.app, {
					titles,
					onSelect: (title) => {
						void this.activateView().then(() => {
							new Notice(t('app.titleNotice', { title: title.title, type: typeLabel(title.type), status: statusLabel(title.status) }));
						});
					},
				}).open();
			},
		});

		const settings = settingsUi({
			app: this.app,
			settings: this.settingsService,
			titles: this.dataManager,
			reading: this.readingDataManager,
			games: this.gameDataManager,
			api: this.apiService,
			layout: () => this.getLayout(),
			backupManagers: () => this.backupManagers(),
			coverRefresher: this.coverRefresher,
			createListManager: this.listManager,
			openDefaultColumns: this.customLists.openDefaultColumns,
			host: {
				setImportProgress: (progress) => { this.importProgress = progress; },
				reloadSettings: () => this.loadSettings(),
				applyCardSizeCssVar: () => this.applyCardSizeCssVar(),
				updateStatusBar: () => this.updateStatusBar(),
				refreshOpenViews: () => this.refreshOpenViews(),
			},
		});
		this.addSettingTab(settings.createSettingsTab(this));

		this.setupStatusBar();
		// keep the status bar in sync with data edits (no new timer: the 60s airtime interval drives the
		// time-based refresh).
		this.register(onDataChanged(() => this.updateStatusBar()));
	}

	/** Vault I/O of the custom lists; a corrupt list file is reported with a notice. */
	private listManager = (onConflict?: (list: CustomList) => void): CustomListManager =>
		new CustomListManager(
			this.app.vault,
			this.app.fileManager,
			() => this.getLayout(),
			(name) => new Notice(t('lists.corrupt', { name })),
			onConflict,
		);

	private refreshOpenViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(HOARD_VIEW_TYPE)) {
			if (leaf.view instanceof HoardView) leaf.view.refreshUI();
		}
	}

	/** Renders a manager notice in the active language. */
	private notifyManager(n: ManagerNotice): void {
		const { code, ...params } = n;
		new Notice(t(`notices.manager.${code}`, params));
	}

	onunload(): void {
		// synchronously flush pending debounced saves so no in-memory edits are lost
		this.dataManager.flushPendingSaveSync();
		this.dataManager.flushLocalData();
		this.dataManager.flushQueuedSaveSync();
		const flushes = [this.readingDataManager.flushPending(), this.gameDataManager.flushPending(), this.settingsService.flush()];
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
			this.layout = new VaultLayout(root ?? DEFAULT_ROOT, () => this.state.types.map((t) => t.name));
			if (root === null) {
				// fresh install (or base not synced yet): no base until the first write; a synced one is adopted
				this.shared.deferBase({
					create: async () => {
						await this.dataManager.ensureFolder(this.layout.root);
						await this.shared.createBase(toRecord(this.state));
					},
					appeared: () => this.adoptSyncedBase(),
				});
				this.index.onLocalWrite(() => void this.shared.ensureBase().catch((e) => console.error('[Hoard] could not create the base', e)));
			}
			await this.shared.load();
			await this.applySharedSettings();
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

	/** A base appeared by sync after startup: take over its root and settings, then rebuild and refresh. */
	private async adoptSyncedBase(): Promise<void> {
		try {
			const root = await detectRoot(this.app.vault);
			if (root !== null) {
				this.layout = new VaultLayout(root, () => this.state.types.map((t) => t.name));
			}
			await this.shared.load();
			await this.applySharedSettings();
			await this.shared.ensureFilter();
			await this.index.rebuild();
			emitDataChanged();
		} catch (e) {
			console.error('[Hoard] could not adopt the synced base', e);
		}
	}

	/** Type names drive classification: a change (local or synced) needs a re-scan of all notes. */
	private syncTypeNames(): void {
		const key = this.state.types.map((t) => t.name).join('\n');
		const changed = this.typeNamesKey !== null && key !== this.typeNamesKey;
		this.typeNamesKey = key;
		if (!changed || !this.indexReady) return;
		void this.index.rebuild().then(() => emitDataChanged());
	}

	/** Everything backup export and restore need. */
	private backupManagers(): BackupManagers {
		return {
			dataManager: this.dataManager,
			readingDataManager: this.readingDataManager,
			gameDataManager: this.gameDataManager,
			historyManager: this.historyManager,
			storage: {
				local: this.local,
				shared: this.shared,
			},
		};
	}

	/** Current vault layout (root and central folders). */
	private getLayout(): VaultLayout {
		return this.layout;
	}

	/** Re-composes settings from the (re)loaded base, then refreshes derived state and views. */
	private async applySharedSettings(): Promise<void> {
		await this.loadSettings();
		this.applyCardSizeCssVar();
		emitDataChanged();
	}

	private startAirtimeScheduler(): void {
		this.checkAirtimeNotifications();
		this.registerInterval(window.setInterval(() => {
			this.checkAirtimeNotifications();
		}, 60000));
	}

	/** Lets AirtimeTab prevent the scheduler from double-firing after a manual tick. */
	private markAirtimeHandled(key: string): void {
		this.notifiedEntries.add(key);
	}

	private checkAirtimeNotifications(): void {
		runAirtimeScheduler(
			this.dataManager,
			this.readingDataManager,
			this.gameDataManager,
			(name) => new Notice(name, 8000),
			this.notifiedEntries,
		);

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
	private updateStatusBar(): void {
		const el = this.statusBarEl;
		if (!el) return;
		if (!this.state.showUpcomingStatusBar) {
			el.hide();
			return;
		}
		const count = this.airtime.countDue();
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
	private getCardMinWidth(): number {
		return cardSizeToMinWidth(
			Platform.isMobile ? this.state.cardSizeMobile : this.state.cardSize,
		);
	}

	/**
	 * Whether a tab's poster cards show their text under the poster (the per-tab cardTextStyles
	 * setting; 'under' is the default for data saved before it existed).
	 */
	private isCardTextUnder(tab: CardStyleTab): boolean {
		return this.state.cardTextStyles?.[tab] !== 'inside';
	}

	/**
	 * Publish the resolved card size as a body-level CSS var, so the plain-CSS grids (detail-modal
	 * member grids, non-virtual fallbacks) track the setting too. Called on load and on every change.
	 * Always the main window's body, not `activeDocument`: Obsidian copies the main body's custom
	 * properties into its other windows (settings, popouts), never back.
	 */
	private applyCardSizeCssVar(): void {
		window.document.body.setCssProps({ '--hoard-card-minimum-width': `${this.getCardMinWidth()}px` });
	}

	/** Keys do not sync between devices: tell a migrated device once that its keychain is empty. */
	private maybeShowSecretsNotice(): void {
		const shown = this.app.loadLocalStorage('hoard-secrets-notice') === true;
		if (!shouldShowSecretsNotice(this.local.data.secretsInStorage === true, this.secretStore.isEmpty(), shown)) return;
		new Notice(t('app.notices.secretsPerDevice'), 0);
		this.app.saveLocalStorage('hoard-secrets-notice', true);
	}

	/** Composes settings from defaults, data.json and the shared base (shared keys win). */
	private loadSettings(): Promise<void> {
		this.state = composeSettings(this.local.data.settings, this.shared.get().settings, this.secretStore.read());
		// mirror into types.ts so the pure formatters render in the chosen order without a settings ref
		setActiveDateFormat(this.state.dateFormat);
		this.syncTypeNames();
		// a restored backup can bring other keys and endpoints
		this.applyApiKeys();
		return Promise.resolve();
	}

	/** Pushes the composed keys into the API service; a changed key makes "no key" checks worth repeating. */
	private applyApiKeys(): void {
		const s = this.state;
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

	private async persistAll(): Promise<void> {
		// keep the date formatters in step with the setting on every save
		setActiveDateFormat(this.state.dateFormat);
		this.syncTypeNames();
		this.applyApiKeys();
		await persistSettings(this.state, this.local, this.shared, this.secretStore);
	}

	/** After the add command: a new Watchlist entry opens its detail (unless the setting is off), anything else just reveals the panel. */
	private async revealAdded({ kind, id }: AddDone): Promise<void> {
		const watchlistKind = kind === 'anime' || kind === 'series' || kind === 'movie';
		if (!watchlistKind || !(this.state.openWatchlistAfterAdd ?? true)) {
			await this.activateView();
			return;
		}
		await this.activateView('watchlist');
		// read once the tab is open: addTitle may have forced "To be released"
		const title = this.dataManager.getTitle(id);
		if (title) this.watchlist.openTitleDetail({ title });
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
				new InsertWidgetModal(this.app, {
					titles,
					onSelect: (title) => {
						if (isMini) {
							editor.replaceSelection(`\`\`\`hoard-todo\n${title.title}\nmini\n\`\`\``);
						} else {
							editor.replaceSelection(`\`\`\`hoard-todo\n${title.title}\n\`\`\``);
						}
					},
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
