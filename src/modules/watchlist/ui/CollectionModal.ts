// TMDB collections (film series). Movies only — TV has no belongs_to_collection.

import { App, Modal, Notice } from 'obsidian';
import { t } from '../../../shared/i18n';
import type { DataManager } from '../services/DataManager';
import type { ApiService } from '../../../shared/api/ApiService';
import type { SettingsReader } from '../../../shared/services/SettingsService';
import { newTitle } from '../../../shared/domain/entryFactories';
import { nonEmpty } from '../../../shared/storage/sharedHelpers';
import type {
	HoardTitle,
	HoardGroup,
	TmdbCollectionDetail,
	TmdbCollectionPart,
} from '../../../shared/domain/types';
import {
	COLLECTION_NONE,
	getCollectionId,
	isCollectionNone,
	imdbIdFromLink,
	getThemedColor,
	getDisplayPoster,
	getApiGroupForType,
} from '../../../shared/domain/types';
import { buildPosterCard } from '../../../shared/ui/PosterCard';
import type { CardMenuContext } from '../../../shared/ui/PosterCard';
import { pinModalFooter } from '../../../shared/ui/StickyModal';

/** What resolving a title's TMDB collection reads and caches. */
export interface ResolveCollectionDeps {
	settings: SettingsReader;
	titles: Pick<DataManager, 'updateTmdbIdentity'>;
	api: Pick<
		ApiService,
		'hasTmdbKey' | 'searchTmdbMovieId' | 'findTmdbMovieIdByImdbId' | 'getTmdbCollection' | 'getTmdbMovieCollection'
	>;
}

export interface CollectionModalDeps extends ResolveCollectionDeps {
	app: App;
	titles: Pick<
		DataManager,
		| 'updateTmdbIdentity' | 'getTitles' | 'getGroups' | 'getEffectiveTotal' | 'generateId' | 'generateGroupId'
		| 'addTitleBatch' | 'addGroup' | 'updateGroup' | 'notifyChange'
	>;
	api: ResolveCollectionDeps['api'] & Pick<ApiService, 'getTmdbMovieDetails'>;
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';
const NOT_ADDED_COLOR = '#4b5563';

function tmdbPoster(path: string | null | undefined, size = 'w342'): string {
	return path ? `${TMDB_IMG_BASE}/${size}${path}` : '';
}

function yearOf(date: string | null | undefined): string {
	return date?.match(/^(\d{4})/)?.[1] ?? '';
}

// lowercase, drop leading article + punctuation
function titleKey(title: string): string {
	return title
		.toLowerCase()
		.replace(/^(the|a|an)\s+/, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

// exact tmdbId first, else title+year (nothing has a tmdbId until something resolves one)
function matchLibraryTitle(
	part: TmdbCollectionPart,
	titles: HoardTitle[],
): HoardTitle | undefined {
	const byId = titles.find((t) => t.tmdbMediaType === 'movie' && t.tmdbId === part.id);
	if (byId) return byId;

	const key = titleKey(part.title ?? '');
	if (!key) return undefined;
	const partYear = yearOf(part.release_date);
	return titles.find((t) => {
		if (titleKey(t.title) !== key) return false;
		const titleYear = yearOf(t.releaseDate);
		// missing year on either side is not a mismatch
		return !partYear || !titleYear || partYear === titleYear;
	});
}

/** The TMDB movie id of a title: the stored one, else /find by IMDb id, else a title search. null = unresolved. */
async function resolveMovieId(deps: ResolveCollectionDeps, title: HoardTitle): Promise<number | null> {
	const api = deps.api;
	// a tv id in tmdbId would query a random film — only a movie id is usable here
	if (title.tmdbMediaType === 'movie' && title.tmdbId) return title.tmdbId;
	const imdbId = imdbIdFromLink(title.externalLink);
	// fuzzy — a miss is never cached
	if (!imdbId) return api.searchTmdbMovieId(title.title, title.releaseDate ?? '');
	const found = await api.findTmdbMovieIdByImdbId(imdbId);
	if (found.status === 'found') return found.value;
	// exact key said not-a-movie. Cache it or every series re-queries; a failed lookup caches nothing.
	if (found.status === 'notfound') deps.titles.updateTmdbIdentity(title.id, null, COLLECTION_NONE);
	return null;
}

// stored tmdbId -> /find by imdb id -> title search. Caches what it learns.
export async function resolveCollection(
	deps: ResolveCollectionDeps,
	title: HoardTitle,
): Promise<TmdbCollectionDetail | null> {
	const api = deps.api;
	if (!api.hasTmdbKey()) return null;
	if (getApiGroupForType(title.type, deps.settings.get().typeApiMapping) !== 'movie') return null;
	if (isCollectionNone(title)) return null;

	const known = getCollectionId(title);
	if (known !== null) return api.getTmdbCollection(known);

	const tmdbId = await resolveMovieId(deps, title);
	if (!tmdbId) return null;

	const lookup = await api.getTmdbMovieCollection(tmdbId);
	if (lookup.status === 'failed' || lookup.status === 'nokey') return null;
	if (lookup.status === 'notfound') {
		deps.titles.updateTmdbIdentity(title.id, tmdbId, COLLECTION_NONE);
		return null;
	}
	deps.titles.updateTmdbIdentity(title.id, tmdbId, lookup.value.id);
	return api.getTmdbCollection(lookup.value.id);
}

export function countMissing(collection: TmdbCollectionDetail, titles: HoardTitle[]): number {
	return (collection.parts ?? []).filter((p) => !matchLibraryTitle(p, titles)).length;
}

export class CollectionModal extends Modal {
	private collection: TmdbCollectionDetail;
	private onChanged?: () => void;
	private changed = false;

	private parts: TmdbCollectionPart[] = [];
	private selected = new Set<number>();
	private createGroup = false;
	private isAdding = false;

	private movieType: string;
	// injected — importing TitleDetailModal would cycle
	private onOpenTitle: (title: HoardTitle) => void;

	private gridEl: HTMLElement | null = null;
	private footerEl: HTMLElement | null = null;
	private metaEl: HTMLElement | null = null;
	private cleanups: (() => void)[] = [];

	constructor(
		private deps: CollectionModalDeps,
		collection: TmdbCollectionDetail,
		movieType: string,
		onOpenTitle: (title: HoardTitle) => void,
		onChanged?: () => void,
	) {
		super(deps.app);
		this.collection = collection;
		this.movieType = movieType;
		this.onOpenTitle = onOpenTitle;
		this.onChanged = onChanged;

		// oldest first, undated last
		this.parts = [...(collection.parts ?? [])].sort((a, b) => {
			const ay = a.release_date || '';
			const by = b.release_date || '';
			if (!ay && !by) return (a.title ?? '').localeCompare(b.title ?? '');
			if (!ay) return 1;
			if (!by) return -1;
			return ay.localeCompare(by);
		});
	}

	onOpen(): void {
		const colorTheme = this.deps.settings.get().colorTheme ?? 'default';
		this.modalEl.setAttribute('data-theme', colorTheme);
		this.modalEl.addClass('hoard-collection__modal-shell');
		this.contentEl.setAttribute('data-theme', colorTheme);
		this.contentEl.addClass('hoard-view');
		this.contentEl.addClass('hoard-detail');
		this.contentEl.addClass('hoard-collection');
		this.renderAll();
	}

	onClose(): void {
		for (const fn of this.cleanups) fn();
		this.cleanups = [];
		this.contentEl.empty();
		if (this.changed && this.onChanged) this.onChanged();
	}

	private renderAll(): void {
		this.contentEl.empty();
		this.renderHeader();
		this.gridEl = this.contentEl.createDiv({
			cls: 'hoard-card-grid hoard-detail__group-grid hoard-collection__grid',
		});
		this.renderGrid();
		this.footerEl = this.contentEl.createDiv({ cls: 'hoard-detail__footer hoard-collection__footer' });
		this.renderFooter();
		pinModalFooter(this.footerEl);
	}

	private renderHeader(): void {
		const header = this.contentEl.createDiv({ cls: 'hoard-collection__header' });

		const posterUrl = tmdbPoster(this.collection.poster_path, 'w185');
		if (posterUrl) {
			const cover = header.createDiv({ cls: 'hoard-collection__cover' });
			const img = cover.createEl('img', { cls: 'hoard-collection__cover-img' });
			img.src = posterUrl;
			img.alt = this.collection.name;
			img.decoding = 'async';
			img.onerror = () => cover.addClass('hoard-hidden');
		}

		const left = header.createDiv({ cls: 'hoard-collection__header-left' });
		left.createEl('h2', { cls: 'hoard-detail__title', text: this.collection.name });
		this.metaEl = left.createDiv({ cls: 'hoard-collection__meta' });
		this.renderMeta();

		if (this.collection.overview) {
			left.createDiv({ cls: 'hoard-collection__overview', text: this.collection.overview });
		}
	}

	private renderMeta(): void {
		if (!this.metaEl) return;
		const titles = this.deps.titles.getTitles();
		const owned = this.parts.filter((p) => matchLibraryTitle(p, titles)).length;
		this.metaEl.setText(t('misc.collection.libraryCount', { owned, total: this.parts.length }));
	}

	private renderGrid(): void {
		const grid = this.gridEl;
		if (!grid) return;
		grid.empty();

		const settings = this.deps.settings.get();
		const titles = this.deps.titles.getTitles();
		const menuCtx: CardMenuContext = { container: grid, cleanups: this.cleanups };

		for (const part of this.parts) {
			const existing = matchLibraryTitle(part, titles);
			const name = part.title ?? t('misc.collection.untitled');
			const year = yearOf(part.release_date);
			const fallbackPoster = tmdbPoster(part.poster_path);

			if (existing) {
				const typeDef = settings.types.find((d) => d.name === existing.type);
				const statusDef = settings.statuses.find((d) => d.name === existing.status);
				const typeColor = typeDef
					? getThemedColor(existing.type, typeDef.color, settings.colorTheme)
					: NOT_ADDED_COLOR;
				const total = this.deps.titles.getEffectiveTotal(existing);
				const ratio =
					existing.status === 'Completed'
						? 1
						: total > 0
							? Math.max(0, Math.min(1, existing.watchedEpisodes.length / total))
							: undefined;

				buildPosterCard(
					grid,
					{
						dataset: { titleId: existing.id },
						title: existing.title,
						posterUrl: getDisplayPoster(existing) || fallbackPoster,
						placeholderColor: typeColor,
						statusLabel: existing.status,
						statusColor: statusDef
							? getThemedColor(existing.status, statusDef.color, settings.colorTheme)
							: undefined,
						typeLabel: existing.type,
						typeColor,
						year: year || undefined,
						progressRatio: ratio,
						onClick: () => {
							this.close();
							this.onOpenTitle(existing);
						},
					},
					menuCtx,
				);
				continue;
			}

			const card = buildPosterCard(
				grid,
				{
					dataset: { partId: String(part.id) },
					title: name,
					posterUrl: fallbackPoster,
					placeholderColor: NOT_ADDED_COLOR,
					selected: this.selected.has(part.id),
					statusLabel: t('misc.collection.notAdded'),
					statusColor: NOT_ADDED_COLOR,
					typeLabel: this.movieType,
					typeColor: NOT_ADDED_COLOR,
					year: year || undefined,
					onClick: (el) => this.toggleSelection(part.id, el),
				},
				menuCtx,
			);
			card.addClass('hoard-card--missing');

			// marker only — whole card toggles
			const tick = card.createDiv({ cls: 'hoard-collection__tick' });
			tick.setText('✓');
		}
	}

	private toggleSelection(partId: number, card: HTMLElement): void {
		if (this.isAdding) return;
		if (this.selected.has(partId)) {
			this.selected.delete(partId);
		} else {
			this.selected.add(partId);
		}
		card.toggleClass('hoard-card--selected', this.selected.has(partId));
		this.renderFooter();
	}

	private renderFooter(): void {
		const footer = this.footerEl;
		if (!footer) return;
		footer.empty();

		const titles = this.deps.titles.getTitles();
		const missing = this.parts.filter((p) => !matchLibraryTitle(p, titles));

		const left = footer.createDiv({ cls: 'hoard-collection__footer-left' });

		if (missing.length > 0) {
			const allSelected = missing.every((p) => this.selected.has(p.id));
			const selectBtn = left.createEl('button', {
				cls: 'hoard-btn hoard-btn--sm',
				text: allSelected ? t('misc.collection.selectNone') : t('misc.collection.selectAll'),
				attr: { type: 'button' },
			});
			selectBtn.disabled = this.isAdding;
			selectBtn.addEventListener('click', () => {
				if (allSelected) {
					this.selected.clear();
				} else {
					for (const p of missing) this.selected.add(p.id);
				}
				this.renderGrid();
				this.renderFooter();
			});
		}

		const groupLabel = left.createEl('label', { cls: 'hoard-collection__group-toggle' });
		const groupCheck = groupLabel.createEl('input', { attr: { type: 'checkbox' } });
		groupCheck.checked = this.createGroup;
		groupCheck.disabled = this.isAdding;
		groupCheck.addEventListener('change', () => {
			this.createGroup = groupCheck.checked;
		});
		groupLabel.createSpan({ text: t('misc.collection.groupAs', { name: this.collection.name }) });

		const addBtn = footer.createEl('button', {
			cls: 'hoard-btn hoard-btn--primary hoard-collection__add',
			attr: { type: 'button' },
		});
		const count = this.selected.size;
		addBtn.setText(
			this.isAdding
				? t('misc.collection.adding')
				: count > 0
					? t('misc.collection.addCount', { count })
					: t('misc.collection.addSelected'),
		);
		addBtn.disabled = this.isAdding || count === 0;
		addBtn.addEventListener('click', () => void this.addSelected());
	}

	// detail call per pick — collection parts carry no runtime. Sequential to avoid throttling.
	private async addSelected(): Promise<void> {
		const picked = this.parts.filter((p) => this.selected.has(p.id));
		if (picked.length === 0 || this.isAdding) return;

		this.isAdding = true;
		this.renderFooter();
		// renderFooter detached the clicked button — re-query
		const addBtn = this.footerEl?.querySelector<HTMLElement>('.hoard-collection__add') ?? null;

		const api = this.deps.api;
		const settings = this.deps.settings.get();
		// shipped defaults may have been renamed away
		const status =
			settings.statuses.find((s) => s.name === 'Plan to watch')?.name ??
			settings.statuses[0]?.name ??
			'Plan to watch';
		const priority =
			settings.priorities?.find((p) => p.name === 'Medium')?.name ??
			settings.priorities?.[0]?.name ??
			'Medium';

		// generateId only sees stored titles — dedupe within the batch too
		const takenIds = new Set(this.deps.titles.getTitles().map((t) => t.id));
		const entries: HoardTitle[] = [];
		let failed = 0;

		for (let i = 0; i < picked.length; i++) {
			const part = picked[i]!;
			addBtn?.setText(t('misc.collection.addingProgress', { current: i + 1, total: picked.length }));

			const detail = await api.getTmdbMovieDetails(String(part.id));
			if (!detail) {
				failed++;
				continue;
			}

			let id = this.deps.titles.generateId(detail.title);
			if (takenIds.has(id)) {
				let n = 2;
				while (takenIds.has(`${id}-${n}`)) n++;
				id = `${id}-${n}`;
			}
			takenIds.add(id);

			entries.push(newTitle({
				id,
				title: detail.title,
				type: this.movieType,
				status,
				priority,
				totalEpisodes: detail.episodes,
				episodeDuration: detail.episodeDuration,
				releaseDate: detail.releaseDate || null,
				externalLink: detail.url,
				seasons: detail.seasons,
				favorite: false,
				posterUrl: '',
				trailerUrl: detail.trailerUrl ?? '',
				manualTrailerUrl: '',
				// both ids known — skips the ladder forever
				tmdbId: part.id,
				collectionId: this.collection.id,
				director: nonEmpty(detail.director),
				cast: nonEmpty(detail.cast),
			}));
		}

		if (entries.length > 0) {
			// handles the future-release "To be released" + Upcoming routing
			await this.deps.titles.addTitleBatch(entries);
			if (this.createGroup) await this.createCollectionGroup(entries);
			this.deps.titles.notifyChange();
			this.changed = true;
			if (this.onChanged) this.onChanged();
		}

		this.isAdding = false;
		this.selected.clear();

		if (failed > 0) {
			new Notice(
				entries.length > 0
					? t('misc.collection.partial', { added: entries.length, failed })
					: t('misc.collection.fetchFailed'),
			);
		} else {
			new Notice(t('misc.collection.added', { count: entries.length, name: this.collection.name }));
		}

		this.renderGrid();
		this.renderMeta();
		this.renderFooter();
	}

	// whole collection, not just the new entries
	private async createCollectionGroup(added: HoardTitle[]): Promise<void> {
		const titles = this.deps.titles.getTitles();
		const memberIds = new Set(added.map((t) => t.id));
		for (const part of this.parts) {
			const existing = matchLibraryTitle(part, titles);
			if (existing) memberIds.add(existing.id);
		}
		if (memberIds.size === 0) return;

		const name = this.collection.name;
		const existingGroup = this.deps.titles.getGroups().find((g) => g.name === name);
		if (existingGroup) {
			// top up, don't duplicate
			for (const id of memberIds) {
				if (!existingGroup.titleIds.includes(id)) existingGroup.titleIds.push(id);
			}
			await this.deps.titles.updateGroup(existingGroup);
			return;
		}

		const group: HoardGroup = {
			id: this.deps.titles.generateGroupId(name),
			name,
			titleIds: [...memberIds],
			dateAdded: new Date().toISOString(),
		};
		await this.deps.titles.addGroup(group);
	}
}
