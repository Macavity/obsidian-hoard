import type { TitleReader } from '../../watchlist/exports';
import type { ReadingReader } from '../../reading/exports';
import type { GameReader } from '../../games/exports';
import type { TabInstance } from '../../../design-system/TabInstance';
import Fuse from 'fuse.js';
import type { EventRef, MetadataCache, Vault, Workspace } from 'obsidian';
import { createIconButton } from '../../../design-system/IconButton';
import type { SettingsReader } from '../../settings/exports';
import type { DraftPersistState } from '../domain/model';
import type { DraftStore } from '../services/roles';
import type { OpenAddRoute } from '../../../shared/services/addRoute';
import { t } from '../../../shared/i18n';

/** Libraries a draft can already live in — used for the "In …" duplicate label. */
type DraftLibrary = 'Watchlist' | 'Books' | 'Manga' | 'Games';

/** Display name of a draft library. */
function libraryLabel(library: DraftLibrary): string {
	switch (library) {
		case 'Watchlist': return t('drafts.libraryWatchlist');
		case 'Books': return t('drafts.libraryBooks');
		case 'Manga': return t('drafts.libraryManga');
		case 'Games': return t('drafts.libraryGames');
	}
}

interface DraftLibraryEntry {
	title: string;
	library: DraftLibrary;
}

interface LiveDraftEntry {
	titleKey: string;
	titleDisplay: string;
	sources: string[];
	firstSeen: string;
	added: boolean;
}

/** The vault pieces the scan for tagged notes reads and the draft cards open. */
export interface DraftsNotes {
	vault: Pick<Vault, 'getMarkdownFiles' | 'cachedRead'>;
	metadataCache: Pick<MetadataCache, 'getFileCache' | 'on' | 'offref'>;
	workspace: Pick<Workspace, 'openLinkText'>;
}

export type DraftTitles = Pick<DraftStore, 'getDrafts'> & Pick<TitleReader, 'getTitles'>;
export type DraftReading = Pick<ReadingReader, 'getBooks' | 'getMangaList'>;
export type DraftGames = Pick<GameReader, 'getGames'>;

export class DraftsTab implements TabInstance {
	private containerEl: HTMLElement;
	private onCountChange: (count: number) => void;

	private eventRef: EventRef | null = null;
	private destroyed = false;
	private scanDebounceTimer: number | null = null;
	private lastScanEntries: LiveDraftEntry[] = [];
	private persistState: DraftPersistState = {
		dismissed: [],
		added: [],
		firstSeen: {},
		titleDisplay: {},
	};

	constructor(
		containerEl: HTMLElement,
		private readonly settings: SettingsReader,
		private readonly titles: DraftTitles & Pick<DraftStore, 'setDrafts'>,
		private readonly reading: DraftReading,
		private readonly games: DraftGames,
		private readonly notes: DraftsNotes,
		private readonly openAdd: OpenAddRoute,
		onCountChange: (count: number) => void,
	) {
		this.containerEl = containerEl;
		this.onCountChange = onCountChange;
	}

	async render(): Promise<void> {
		this.destroyed = false;
		this.loadPersistState();
		if (this.destroyed) return;

		const entries = await this.scanVault();
		if (this.destroyed) return;

		this.renderUI(entries);
		this.registerChangeListener();
	}

	destroy(): void {
		this.destroyed = true;
		if (this.scanDebounceTimer) {
			window.clearTimeout(this.scanDebounceTimer);
			this.scanDebounceTimer = null;
		}
		if (this.eventRef) {
			this.notes.metadataCache.offref(this.eventRef);
			this.eventRef = null;
		}
	}

	// Persistence

	private loadPersistState(): void {
		const drafts = this.titles.getDrafts();
		if (drafts) {
			this.persistState = {
				dismissed: drafts.dismissed ?? [],
				added: drafts.added ?? [],
				firstSeen: drafts.firstSeen ?? {},
				titleDisplay: drafts.titleDisplay ?? {},
			};
		}
	}

	private savePersistState(): void {
		this.titles.setDrafts(this.persistState);
	}

	// Vault scanning

	private getTag(): string {
		return this.settings.get().draftsVaultTag ?? '#hoard';
	}

	/**
	 * Scans the vault for inline-tag draft mentions, returning lowercase title key →
	 * { sources, displayTitle }. Pure (no persistState side effects), so it backs both the full render
	 * and the count-only badge scan. Inline tags only — frontmatter tags are ignored.
	 */
	private static async scanTaggedFiles(
		notes: Pick<DraftsNotes, 'vault' | 'metadataCache'>,
		tag: string,
	): Promise<Map<string, { sources: Set<string>; displayTitle: string }>> {
		const files = notes.vault.getMarkdownFiles();
		const liveMap: Map<string, { sources: Set<string>; displayTitle: string }> = new Map();

		for (const file of files) {
			const cache = notes.metadataCache.getFileCache(file);
			const hasTag = cache?.tags?.some((t) => t.tag === tag) ?? false;
			if (!hasTag) continue;

			try {
				const content = await notes.vault.cachedRead(file);
				const lines = content.split('\n');
				for (const line of lines) {
					if (!line.includes(tag)) continue;
					const tagIdx = line.indexOf(tag);
					const afterTag = line.slice(tagIdx + tag.length).trim();
					if (!afterTag) continue;

					// each comma-separated segment after the tag is a separate title
					const segments = afterTag.split(',');
					for (const seg of segments) {
						const displayTitle = seg.trim();
						if (!displayTitle || displayTitle.length > 100) continue;
						const titleKey = displayTitle.toLowerCase();
						if (!liveMap.has(titleKey)) {
							liveMap.set(titleKey, { sources: new Set(), displayTitle });
						}
						liveMap.get(titleKey)!.sources.add(file.basename);
					}
				}
			} catch {
				// skip unreadable files
			}
		}

		return liveMap;
	}

	private async scanVault(): Promise<LiveDraftEntry[]> {
		const tag = this.getTag();
		const liveMap = await DraftsTab.scanTaggedFiles(this.notes, tag);

		// record firstSeen and displayTitle for newly discovered entries
		let stateChanged = false;
		const now = new Date().toISOString();
		for (const [key, { displayTitle }] of liveMap) {
			if (!this.persistState.firstSeen[key]) {
				this.persistState.firstSeen[key] = now;
				stateChanged = true;
			}
			if (!this.persistState.titleDisplay[key]) {
				this.persistState.titleDisplay[key] = displayTitle;
				stateChanged = true;
			}
		}
		if (stateChanged) {
			this.savePersistState();
		}

		// dismissed entries are excluded entirely
		const entries: LiveDraftEntry[] = [];
		for (const [key, { sources }] of liveMap) {
			if (this.persistState.dismissed.includes(key)) continue;
			entries.push({
				titleKey: key,
				titleDisplay: this.persistState.titleDisplay[key] ?? key,
				sources: Array.from(sources),
				firstSeen: this.persistState.firstSeen[key] ?? now,
				added: this.persistState.added.includes(key),
			});
		}

		// oldest-first (FIFO queue)
		entries.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
		this.lastScanEntries = entries;
		return entries;
	}

	// Event listener

	private triggerDebouncedRender(): void {
		if (this.scanDebounceTimer) window.clearTimeout(this.scanDebounceTimer);
		this.scanDebounceTimer = window.setTimeout(() => {
			this.scanDebounceTimer = null;
			void this.render();
		}, 500);
	}

	private registerChangeListener(): void {
		if (this.eventRef) {
			this.notes.metadataCache.offref(this.eventRef);
		}
		this.eventRef = this.notes.metadataCache.on('changed', (_file) => {
			this.triggerDebouncedRender();
		});
	}

	// Fuzzy match helper

	/**
	 * Fuse index over every library a draft can be routed into — Watchlist, Books, Manga and Games — so
	 * a draft already added anywhere counts as a duplicate. Each entry carries its library so the card
	 * can name it ("In Games", "In Books", …).
	 */
	private static buildFuse(titles: DraftTitles, reading: DraftReading, games: DraftGames): Fuse<DraftLibraryEntry> {
		const entries: DraftLibraryEntry[] = [
			...titles.getTitles().map((ti) => ({ title: ti.title, library: 'Watchlist' as const })),
			...reading.getBooks().map((b) => ({ title: b.title, library: 'Books' as const })),
			...reading.getMangaList().map((m) => ({ title: m.title, library: 'Manga' as const })),
			...games.getGames().map((g) => ({ title: g.title, library: 'Games' as const })),
		];
		return new Fuse(entries, {
			keys: ['title'],
			threshold: 0.35,
			includeScore: true,
		});
	}

	/** The library holding a matching entry, or null when the draft is new. */
	private static findLibraryMatch(displayTitle: string, fuse: Fuse<DraftLibraryEntry>): DraftLibrary | null {
		const results = fuse.search(displayTitle);
		const best = results[0];
		if (!best || (best.score ?? 1) > 0.35) return null;
		return best.item.library;
	}

	/**
	 * Count-only drafts scan for the tab badge — mirrors renderUI's pending-count logic without touching
	 * the DOM or persistState. "Pending" = tagged, not dismissed, not marked added, and not already in
	 * Watchlist / Reading / Games (exact key or fuzzy title). Cheap: only tagged files are read.
	 */
	static async computePendingCount(
		settings: SettingsReader,
		titles: DraftTitles,
		reading: DraftReading,
		games: DraftGames,
		notes: Pick<DraftsNotes, 'vault' | 'metadataCache'>,
	): Promise<number> {
		const tag = settings.get().draftsVaultTag ?? '#hoard';
		const liveMap = await DraftsTab.scanTaggedFiles(notes, tag);

		const drafts = titles.getDrafts();
		const dismissed = new Set(drafts?.dismissed ?? []);
		const added = new Set(drafts?.added ?? []);
		const titleDisplay = drafts?.titleDisplay ?? {};

		const fuse = DraftsTab.buildFuse(titles, reading, games);

		let pending = 0;
		for (const [key, { displayTitle }] of liveMap) {
			if (dismissed.has(key) || added.has(key)) continue;
			const display = titleDisplay[key] ?? displayTitle;
			if (!DraftsTab.findLibraryMatch(display, fuse)) pending++;
		}
		return pending;
	}

	// Rendering

	private renderUI(entries: LiveDraftEntry[]): void {
		const el = this.containerEl;
		el.empty();

		const tag = this.getTag();
		const fuse = DraftsTab.buildFuse(this.titles, this.reading, this.games);

		// resolve the matching library once per entry and cache it (null = new draft)
		const fuzzyCache = new Map<string, DraftLibrary | null>();
		for (const entry of entries) {
			if (entry.added) {
				fuzzyCache.set(entry.titleKey, null);
			} else {
				fuzzyCache.set(entry.titleKey, DraftsTab.findLibraryMatch(entry.titleDisplay, fuse));
			}
		}

		// pending = not added AND not already present in any library
		const pendingCount = entries.filter((e) => {
			if (e.added) return false;
			return !fuzzyCache.get(e.titleKey);
		}).length;
		this.onCountChange(pendingCount);

		if (this.settings.get().showHintBanners) {
			el.createDiv({
				cls: 'hoard-drafts__notice',
				text: `⚠ ${t('drafts.hint', { tag })}`,
			});
		}

		const countWrap = el.createDiv({ cls: 'hoard-list__title-wrap' });
		countWrap.createSpan({ cls: 'hoard-list__count', text: String(pendingCount) });
		countWrap.createSpan({
			cls: 'hoard-drafts__count-label',
			text: ` ${t('drafts.pending', { count: pendingCount })}`,
		});

		if (entries.length === 0) {
			el.createDiv({
				cls: 'hoard-drafts__empty',
				text: t('drafts.empty', { tag }),
			});
			return;
		}

		// entries not yet in a library first (oldest-first), already-present ones last
		entries.sort((a, b) => {
			const aDup = fuzzyCache.get(a.titleKey) != null;
			const bDup = fuzzyCache.get(b.titleKey) != null;
			if (aDup !== bDup) return aDup ? 1 : -1;
			return a.firstSeen.localeCompare(b.firstSeen);
		});

		const cards = el.createDiv({ cls: 'hoard-drafts__cards' });
		for (const entry of entries) {
			this.renderCard(cards, entry, fuzzyCache.get(entry.titleKey) ?? null);
		}
	}

	private renderCard(cards: HTMLElement, entry: LiveDraftEntry, dupLibrary: DraftLibrary | null): void {
		const isDuplicate = dupLibrary !== null;

		// dim rows already in a library; style added rows
		let cls = 'hoard-drafts__card';
		if (isDuplicate) cls += ' hoard-drafts__card--watchlist';
		if (entry.added) cls += ' hoard-drafts__card--added';

		const card = cards.createDiv({ cls });

		card.createDiv({ cls: 'hoard-drafts__card-title', text: entry.titleDisplay });

		const sourceEl = card.createDiv({ cls: 'hoard-drafts__card-source' });
		if (entry.sources.length > 0) {
			const primaryNote = entry.sources[0]!;
			const link = sourceEl.createSpan({
				cls: 'hoard-drafts__source-link',
				text: `[[${primaryNote}]]`,
			});
			link.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.notes.workspace.openLinkText(primaryNote, '');
			});
			if (entry.sources.length > 1) {
				sourceEl.createSpan({
					cls: 'hoard-drafts__source-count',
					text: ` (${entry.sources.length})`,
					attr: { title: entry.sources.join('\n') },
				});
			}
		}

		// "In <library>" indicator, only when applicable
		const dupEl = card.createDiv({ cls: 'hoard-drafts__card-duplicate' });
		if (dupLibrary) {
			const libraryName = libraryLabel(dupLibrary);
			dupEl.createSpan({
				text: t('drafts.inLibrary', { library: libraryName }),
				attr: {
					title: dupLibrary === 'Watchlist'
						? t('drafts.existsWatchlist')
						: t('drafts.existsLibrary', { library: libraryName }),
				},
			});
		}

		const actions = card.createDiv({ cls: 'hoard-drafts__card-actions' });

		if (entry.added || isDuplicate) {
			actions.createSpan({ cls: 'hoard-drafts__added-label', text: t('drafts.added') });
		} else {
			const addBtn = actions.createEl('button', {
				cls: 'hoard-btn hoard-btn--sm hoard-btn--primary',
				text: t('common.add'),
			});
			addBtn.addEventListener('click', () => this.openAddModal(entry));
		}

		const dismissBtn = createIconButton(actions, {
			icon: 'x',
			label: t('drafts.dismiss'),
			cls: 'hoard-drafts__dismiss',
		});
		dismissBtn.addEventListener('click', () => this.dismissEntry(entry.titleKey));
	}

	private rerenderFromCache(): void {
		const entries = this.lastScanEntries
			.filter((e) => !this.persistState.dismissed.includes(e.titleKey))
			.map((e) => ({
				...e,
				added: this.persistState.added.includes(e.titleKey),
			}));
		this.renderUI(entries);
	}

	// Actions

	private dismissEntry(titleKey: string): void {
		if (!this.persistState.dismissed.includes(titleKey)) {
			this.persistState.dismissed.push(titleKey);
		}
		this.persistState.added = this.persistState.added.filter((k) => k !== titleKey);
		this.savePersistState();
		this.rerenderFromCache();
	}

	private openAddModal(entry: LiveDraftEntry): void {
		this.openAdd({
			title: entry.titleDisplay,
			onAdded: () => this.afterAdded(entry.titleKey),
		});
	}

	private afterAdded(titleKey: string): void {
		const behavior = this.settings.get().draftsAfterAdding ?? 'keep';
		if (behavior === 'remove') {
			this.dismissEntry(titleKey);
		} else {
			if (!this.persistState.added.includes(titleKey)) {
				this.persistState.added.push(titleKey);
			}
			this.savePersistState();
			this.rerenderFromCache();
		}
	}
}
