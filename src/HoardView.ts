import { ItemView, Platform, setIcon, WorkspaceLeaf } from 'obsidian';
import type HoardPlugin from './main';
import type { DataManager } from './DataManager';
import { DashboardTab } from './DashboardTab';
import { ListTab } from './ListTab';

export const HOARD_VIEW_TYPE = 'hoard-view';

export type TabName = 'dashboard' | 'watchlist' | 'upcoming' | 'reading' | 'games' | 'custom-lists' | 'drafts' | 'log';

/** What a tab factory receives. `setBadge` updates the count badge on the tab's own button. */
interface TabContext {
	containerEl: HTMLElement;
	plugin: HoardPlugin;
	dataManager: DataManager;
	setBadge: (count: number) => void;
}

/** A live tab instance; recreated on every switch to its tab, re-rendered in place on data changes. */
interface TabInstance {
	render(): void | Promise<void>;
	destroy?(): void;
}

interface TabBadge {
	/** Computes the badge count without the tab being open. */
	count(plugin: HoardPlugin, dataManager: DataManager): number | Promise<number>;
	/** When the count is recomputed: on every data change, or once the metadata cache has resolved. */
	refreshOn: 'data-change' | 'metadata-resolved';
}

interface TabDefinition {
	name: TabName;
	label: string;
	icon: string;
	/** Class the tab adds to the tab-content element; stripped before another tab renders. */
	cls: string;
	create(ctx: TabContext): TabInstance;
	badge?: TabBadge;
}

/** Tabs in tab-bar order. */
const TABS: TabDefinition[] = [
	{
		name: 'dashboard',
		label: 'Dashboard',
		icon: 'layout-dashboard',
		cls: 'hoard-dashboard',
		create: (ctx) => new DashboardTab(ctx.containerEl, ctx.plugin, ctx.dataManager, ctx.plugin.readingDataManager),
	},
	{
		name: 'watchlist',
		label: 'Watchlist',
		icon: 'tv',
		cls: 'hoard-list',
		create: (ctx) => new ListTab(ctx.containerEl, ctx.plugin, ctx.dataManager),
	},
];

export class HoardView extends ItemView {
	private plugin: HoardPlugin;
	private dataManager: DataManager;
	private activeTab: TabName;
	private activeInstance: TabInstance | null = null;
	private tabButtons: Partial<Record<TabName, HTMLButtonElement>> = {};
	private tabContentEl: HTMLElement | null = null;
	private dataChangeListener: () => void;
	private mobileResizeObserver: ResizeObserver | null = null;
	private mobileSizerRaf: number | null = null;
	private lastAppliedTabHeight = -1;
	// mobile keyboard "edit pin" state (see the edit-pin block below)
	private editPinActive = false;
	private smallestEditHeight = -1;
	private pinReleaseTimer: number | null = null;
	private focusListenersBound = false;

	constructor(leaf: WorkspaceLeaf, plugin: HoardPlugin, dataManager: DataManager) {
		super(leaf);
		this.plugin = plugin;
		this.dataManager = dataManager;
		// the panel always opens on the Dashboard tab
		this.activeTab = 'dashboard';
		// re-render in place so tab instances (and their state) are preserved
		this.dataChangeListener = () => {
			this.refreshActiveTab();
		};
	}

	getViewType(): string {
		return HOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Hoard';
	}

	getIcon(): string {
		return 'tv';
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.dataManager.onChange(this.dataChangeListener);
		this.buildUI();

		if (Platform.isMobile) {
			this.setupTabContentSizer();
		}
	}

	// Mobile keyboard layout fix. When the keyboard opens, this WebView freezes .hoard-tab-content at its
	// content height instead of distributing .hoard-view's free space via flex-grow, leaving the tab the
	// wrong size until a reflow forces it. Fix: observe .hoard-view and, on every settle (keyboard
	// open/close, rotation, split resize), imperatively set an explicit px height (+ flex:none
	// !important) on the *current* .hoard-tab-content — re-queried in the callback so it survives
	// tab-content rebuilds.
	private setupTabContentSizer(): void {
		// never run more than one observer (onOpen could run again)
		this.mobileResizeObserver?.disconnect();
		this.mobileResizeObserver = new ResizeObserver(() => {
			// coalesce resize bursts (keyboard animation fires many) into one write per frame
			if (this.mobileSizerRaf !== null) return;
			this.mobileSizerRaf = window.requestAnimationFrame(() => {
				this.mobileSizerRaf = null;
				this.applyTabContentHeight();
			});
		});
		this.mobileResizeObserver.observe(this.contentEl);

		// layer 2, focus listeners: detect an inline editor inside the scroller gaining or losing focus, so
		// the scroller height can be pinned/released. Bound once.
		if (!this.focusListenersBound) {
			this.registerDomEvent(this.contentEl, 'focusin', (e: FocusEvent) => this.onScrollerFocusIn(e));
			this.registerDomEvent(this.contentEl, 'focusout', (e: FocusEvent) => this.onScrollerFocusOut(e));
			this.focusListenersBound = true;
		}
	}

	// Mobile keyboard fix — edit pin. On short lists (notably Custom Lists) inline-editing a cell opens
	// the keyboard, but some resize readings during that window momentarily report the FULL
	// no-keyboard height; honouring them re-expands .hoard-tab-content and exposes a dark band under the
	// content. Fix: while an editor inside the scroller is focused, pin to the SMALLEST clientHeight
	// observed and ignore any larger reading. Release is guaranteed on focusout (after a grace window,
	// so cell-to-cell navigation doesn't flicker), with a safety net in applyTabContentHeight().

	/** True when `target` is an input/textarea/contenteditable inside .hoard-tab-content. */
	private isEditorInScroller(target: EventTarget | null): boolean {
		const node = target as HTMLElement | null;
		if (!node || typeof node.tagName !== 'string') return false;
		const tabContent = this.contentEl.querySelector(':scope > .hoard-tab-content');
		if (!tabContent || !tabContent.contains(node)) return false;
		const tag = node.tagName.toLowerCase();
		return tag === 'input' || tag === 'textarea' || node.isContentEditable === true;
	}

	private onScrollerFocusIn(e: FocusEvent): void {
		if (!Platform.isMobile || !this.isEditorInScroller(e.target)) return;
		// re-focusing within the grace window (cell navigation) — keep the pin
		if (this.pinReleaseTimer !== null) {
			window.clearTimeout(this.pinReleaseTimer);
			this.pinReleaseTimer = null;
		}
		// start a fresh editing session: re-measure the smallest height
		if (!this.editPinActive) this.smallestEditHeight = -1;
		this.editPinActive = true;
		// force the next reading (keyboard-shrunk) to be applied & pinned
		this.lastAppliedTabHeight = -1;
		this.applyTabContentHeight();
	}

	private onScrollerFocusOut(e: FocusEvent): void {
		if (!this.isEditorInScroller(e.target)) return;
		if (this.pinReleaseTimer !== null) window.clearTimeout(this.pinReleaseTimer);
		// grace window: only release once focus has truly left every editor in the scroller
		this.pinReleaseTimer = window.setTimeout(() => {
			this.pinReleaseTimer = null;
			const active = this.contentEl.ownerDocument.activeElement;
			if (this.isEditorInScroller(active)) return;
			this.releaseEditPin();
		}, 250);
	}

	/** Drops the pin and hands sizing back to the ResizeObserver (full height). */
	private releaseEditPin(): void {
		if (!this.editPinActive) return;
		this.editPinActive = false;
		this.smallestEditHeight = -1;
		const tabContent = this.contentEl.querySelector<HTMLElement>(':scope > .hoard-tab-content');
		// remove the pinned height and let the observer re-assert the full height now the keyboard closed
		tabContent?.removeClass('hoard-tab-content-pinned');
		this.lastAppliedTabHeight = -1;
		this.applyTabContentHeight();
	}

	private applyTabContentHeight(): void {
		const viewContent = this.contentEl;
		if (!viewContent) return;
		const tabBar = viewContent.querySelector<HTMLElement>(':scope > .hoard-tab-bar');
		const tabContent = viewContent.querySelector<HTMLElement>(':scope > .hoard-tab-content');
		if (!tabContent) return;

		const viewClientHeight = viewContent.clientHeight;
		const tabBarHeight = tabBar ? tabBar.offsetHeight : 0;
		let target = viewClientHeight - tabBarHeight;

		// guard: don't write until hoard-view has a real measured height
		if (target <= 0) return;

		// edit pin layer
		if (this.editPinActive) {
			// safety net: focus left the scroller without a focusout firing (e.g. the editor was removed on
			// save) — release so it doesn't stay pinned at the keyboard-shrunk height
			if (!this.isEditorInScroller(this.contentEl.ownerDocument.activeElement)) {
				this.releaseEditPin();
				return;
			}
			// track the smallest height seen while editing and pin to it, ignoring larger (no-keyboard)
			// readings during this window
			if (this.smallestEditHeight < 0 || target < this.smallestEditHeight) {
				this.smallestEditHeight = target;
			}
			target = this.smallestEditHeight;
		}

		// guard: skip redundant writes when the height hasn't changed
		if (target === this.lastAppliedTabHeight) return;
		this.lastAppliedTabHeight = target;

		// the pinned class sets an explicit px height (via CSS variable) + flex:none, beating the
		// `flex: 1 1 0%` base rule this WebView fails to distribute. min-height:0 / overflow-y stay intact.
		tabContent.addClass('hoard-tab-content-pinned');
		tabContent.setCssProps({ '--hoard-pinned-tab-height': `${target}px` });
	}

	/** Called after tab content changes on mobile to re-apply the height. */
	refreshMobileLayout(): void {
		if (!Platform.isMobile || !this.mobileResizeObserver) return;
		// a tab switch recreates .hoard-tab-content with no inline height; force a re-apply even when the
		// hoard-view height itself hasn't changed
		this.lastAppliedTabHeight = -1;
		this.applyTabContentHeight();
	}

	async onClose(): Promise<void> {
		await super.onClose();
		this.dataManager.offChange(this.dataChangeListener);
		this.overflowObserver?.disconnect();
		this.overflowObserver = null;
		if (this.mobileResizeObserver) {
			this.mobileResizeObserver.disconnect();
			this.mobileResizeObserver = null;
		}
		if (this.mobileSizerRaf !== null) {
			window.cancelAnimationFrame(this.mobileSizerRaf);
			this.mobileSizerRaf = null;
		}
		// clear edit-pin timer/state (focus listeners auto-removed via registerDomEvent)
		if (this.pinReleaseTimer !== null) {
			window.clearTimeout(this.pinReleaseTimer);
			this.pinReleaseTimer = null;
		}
		this.editPinActive = false;
		this.smallestEditHeight = -1;
		// clear the explicit sizing the mobile keyboard fix applied to hoard-tab-content
		const tabContent = this.contentEl.querySelector<HTMLElement>('.hoard-tab-content');
		if (tabContent) {
			tabContent.removeClass('hoard-tab-content-pinned');
			tabContent.style.removeProperty('--hoard-pinned-tab-height');
		}
		this.destroyActiveTab();
	}

	/** Reapplies the active colour theme and rebuilds the UI. Used by SettingsTab. */
	refreshUI(): void {
		this.applyColorTheme(this.contentEl);
		this.buildUI();
	}

	private applyColorTheme(root: HTMLElement): void {
		const colorTheme = this.plugin.settings.colorTheme ?? 'default';
		if (colorTheme === 'default') {
			root.removeAttribute('data-theme');
		} else {
			root.setAttribute('data-theme', colorTheme);
		}
	}

	private destroyActiveTab(): void {
		this.activeInstance?.destroy?.();
		this.activeInstance = null;
	}

	private buildUI(): void {
		// tear down the live tab (inline editors, document listeners) before rebuilding the UI
		this.destroyActiveTab();

		const root = this.contentEl;
		root.empty();
		root.addClass('hoard-view');
		// mobile gets icon-only tabs and the container-responsive dashboard grid; desktop keeps text
		// labels and the fixed 3-column layout. Toggled via this class so styling keys off Platform.isMobile,
		// not a viewport media query.
		root.toggleClass('hoard-mobile', Platform.isMobile);
		this.applyColorTheme(root);

		const tabBar = root.createDiv({ cls: 'hoard-tab-bar' });
		this.tabButtons = {};
		for (const def of TABS) {
			const btn = this.makeTabBtn(tabBar, def.name, def.label, def.icon);
			this.tabButtons[def.name] = btn;
			btn.addEventListener('click', () => this.setActiveTab(def.name));
		}

		this.tabContentEl = root.createDiv({ cls: 'hoard-tab-content' });
		this.renderTabContent();

		this.updateBadges('data-change');

		// metadata-resolved badges need a vault scan, so they are only correct once the metadata cache is
		// ready — gate on 'resolved' (which also fires for changes made while Obsidian was closed, avoiding
		// a stale count). The direct call covers an already-resolved cache, where 'resolved' won't fire.
		this.updateBadges('metadata-resolved');
		this.registerEvent(this.plugin.app.metadataCache.on('resolved', () => {
			this.updateBadges('metadata-resolved');
		}));
	}

	/**
	 * Tab-bar button. Mobile renders icon-only (Lucide via setIcon) with the label as the accessible
	 * name; desktop shows the text label.
	 */
	private makeTabBtn(tabBar: HTMLElement, tab: TabName, label: string, icon: string): HTMLButtonElement {
		const btn = tabBar.createEl('button', {
			cls: `hoard-tab-btn${this.activeTab === tab ? ' is-active' : ''}`,
		});
		if (Platform.isMobile) {
			btn.addClass('hoard-tab-btn-icon');
			setIcon(btn, icon);
			btn.setAttribute('aria-label', label);
		} else {
			btn.setText(label);
		}
		return btn;
	}

	/**
	 * Count badge on a tab button. Desktop shows "Label (N)"; mobile (icon mode) can't overwrite the
	 * icon, so it toggles a small purple dot.
	 */
	private setTabBadge(btn: HTMLButtonElement | null, label: string, count: number): void {
		if (!btn) return;
		if (Platform.isMobile) {
			btn.toggleClass('hoard-tab-has-badge', count > 0);
		} else {
			btn.textContent = count > 0 ? `${label} (${count})` : label;
		}
	}

	/**
	 * Switch tabs, from a tab-button click or programmatically (e.g. the status-bar Upcoming counter):
	 * updates active state and re-renders the content.
	 */
	setActiveTab(tab: TabName): void {
		if (this.activeTab === tab || !TABS.some((def) => def.name === tab)) return;
		// UI not built yet — record the intent so the initial render reflects it
		if (!this.tabContentEl) { this.activeTab = tab; return; }
		this.activeTab = tab;
		for (const b of Object.values(this.tabButtons)) b?.removeClass('is-active');
		this.tabButtons[tab]?.addClass('is-active');
		this.renderTabContent();
	}

	private renderTabContent(): void {
		if (!this.tabContentEl) return;
		// tear down inline editors / document listeners from the previous tab
		this.destroyActiveTab();
		this.tabContentEl.empty();
		this.stripTabClasses();

		const def = TABS.find((d) => d.name === this.activeTab) ?? TABS[0];
		if (!def) return;
		this.activeTab = def.name;
		this.activeInstance = def.create({
			containerEl: this.tabContentEl,
			plugin: this.plugin,
			dataManager: this.dataManager,
			setBadge: (count) => this.setTabBadge(this.tabButtons[def.name] ?? null, def.label, count),
		});
		void this.activeInstance.render();
		this.guardOverflow();
		this.refreshMobileLayout();
	}

	private stripTabClasses(): void {
		if (!this.tabContentEl) return;
		for (const def of TABS) this.tabContentEl.removeClass(def.cls);
	}

	/**
	 * Called by the data change listener. Re-renders the active tab instance in place, so its state
	 * (expandedId, filters) survives.
	 */
	private refreshActiveTab(): void {
		this.applyColorTheme(this.contentEl);
		this.stripTabClasses();
		if (!this.activeInstance) {
			this.renderTabContent();
			return;
		}
		void this.activeInstance.render();
		this.guardOverflow();
		this.updateBadges('data-change');
	}

	private overflowObserver: MutationObserver | null = null;

	private guardOverflow(): void {
		if (!this.tabContentEl) return;
		this.overflowObserver?.disconnect();

		const el = this.tabContentEl;
		const renderTime = Date.now();

		this.overflowObserver = new MutationObserver(() => {
			if (Date.now() - renderTime > 300) return;
			const computed = window.getComputedStyle(el).overflow;
			if (computed === 'hidden') {
				// strip any inline override so the class rule below wins without !important
				el.style.removeProperty('overflow');
				el.addClass('hoard-force-overflow-auto');
			}
		});
		this.overflowObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
	}

	private updateBadges(trigger: TabBadge['refreshOn']): void {
		for (const def of TABS) {
			if (def.badge?.refreshOn !== trigger) continue;
			const { badge, label } = def;
			const btn = this.tabButtons[def.name] ?? null;
			void Promise.resolve(badge.count(this.plugin, this.dataManager)).then((count) => {
				this.setTabBadge(btn, label, count);
			});
		}
	}
}
