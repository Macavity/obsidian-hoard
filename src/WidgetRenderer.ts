import { MarkdownPostProcessorContext } from 'obsidian';
import type HoardPlugin from './main';
import type { DataManager } from './DataManager';
import type { HoardTitle, HoardGroup, TagDefinition } from './types';
import { formatTime, getThemedColor, formatDateDisplay, formatShortDateDisplay } from './types';

export interface NextRelease { titleName: string; type: string; releaseDate: string; daysUntil: number }

/** Episode progress (%) over all member titles; 0 when they have no episodes. */
export function groupProgress(members: HoardTitle[], effectiveTotal: (t: HoardTitle) => number): number {
	const watched = members.reduce((sum, t) => sum + t.watchedEpisodes.length, 0);
	const total = members.reduce((sum, t) => sum + effectiveTotal(t), 0);
	return total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0;
}

/** The one-off airtime entry with the soonest release at or after `now`, or null. */
export function findNextRelease(
	entries: ReturnType<DataManager['getAirtimeEntries']>,
	titles: HoardTitle[],
	now: number,
): NextRelease | null {
	const titleMap = new Map(titles.map((t) => [t.id, t]));
	// date-only releases compare by local calendar day: a release stays "today" until midnight
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const todayMs = today.getTime();
	let best: NextRelease | null = null;
	let bestMs = Infinity;
	for (const entry of entries) {
		const title = titleMap.get(entry.titleId);
		if (!title || entry.schedule.recurrence !== 'once' || !entry.schedule.releaseDate) continue;
		const dayMs = new Date(entry.schedule.releaseDate + 'T00:00:00').getTime();
		if (dayMs >= todayMs && dayMs < bestMs) {
			bestMs = dayMs;
			best = {
				titleName: title.title,
				type: title.type,
				releaseDate: entry.schedule.releaseDate,
				daysUntil: Math.round((dayMs - todayMs) / 86400000),
			};
		}
	}
	return best;
}

type WidgetLanguage = 'hoard' | 'hoard-todo' | 'hoard-stat' | 'hoard-upcoming' | 'hoard-nowwatching' | 'hoard-now-next';

export class WidgetRenderer {
	private plugin: HoardPlugin;
	private dataManager: DataManager;

	/** Registry of rendered widget containers (el → titleId). Stale entries are removed lazily. */
	private widgetRegistry = new Map<HTMLElement, string>();
	/** Which registered widgets are in mini mode (for a correct re-render on data change). */
	private widgetMiniRegistry = new Map<HTMLElement, boolean>();
	/** Generic re-render hooks for non-todo widgets (stats, upcoming, now-watching, now-next). */
	private widgetRerender = new Map<HTMLElement, () => void>();
	private dataChangedListener: EventListener;

	constructor(plugin: HoardPlugin, dataManager: DataManager) {
		this.plugin = plugin;
		this.dataManager = dataManager;

		const handlers: Record<WidgetLanguage, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void> = {
			'hoard': (source, el, ctx) => this.process(source, el, ctx),
			'hoard-todo': (source, el) => this.processWlTodo(source, el),
			'hoard-stat': (source, el) => this.processWlStat(source, el),
			'hoard-upcoming': (source, el) => this.processWlUpcoming(source, el),
			'hoard-nowwatching': (source, el) => this.processWlNowWatching(source, el),
			'hoard-now-next': (source, el) => this.processWlNowNext(source, el),
		};
		for (const [language, handler] of Object.entries(handlers) as [WidgetLanguage, typeof handlers[WidgetLanguage]][]) {
			this.plugin.registerMarkdownCodeBlockProcessor(language, handler);
		}

		// re-render all active widgets on data change (list → widget sync)
		this.dataChangedListener = () => this.onDataChanged();
		activeDocument.addEventListener('hoard-data-changed', this.dataChangedListener);

		// clean up the listener on plugin unload
		plugin.register(() => {
			activeDocument.removeEventListener('hoard-data-changed', this.dataChangedListener);
		});
	}

	/** Called by the `hoard-data-changed` DOM event. Re-renders all live widgets. */
	private onDataChanged(): void {
		const stale: HTMLElement[] = [];

		for (const [el, titleId] of this.widgetRegistry) {
			if (!el.isConnected) {
				stale.push(el);
				continue;
			}
			const title = this.dataManager.getTitle(titleId);
			if (!title) {
				stale.push(el);
				continue;
			}
			const isMini = this.widgetMiniRegistry.get(el) ?? false;
			if (isMini) {
				this.renderWidgetMinimal(el, title);
			} else {
				this.renderWidget(el, title);
			}
		}

		for (const el of stale) {
			this.widgetRegistry.delete(el);
			this.widgetMiniRegistry.delete(el);
		}

		const staleGeneric: HTMLElement[] = [];
		for (const [el, rerender] of this.widgetRerender) {
			if (!el.isConnected) {
				staleGeneric.push(el);
				continue;
			}
			try { rerender(); } catch (e) { console.warn('[Hoard] widget rerender failed:', e); }
		}
		for (const el of staleGeneric) this.widgetRerender.delete(el);
	}

	/** Clear all widget registries (plugin unload). */
	cleanup(): void {
		this.widgetRegistry.clear();
		this.widgetMiniRegistry.clear();
		this.widgetRerender.clear();
	}

	private process(
		source: string,
		el: HTMLElement,
		_ctx: MarkdownPostProcessorContext,
	): void {
		const idMatch = source.match(/id:\s*(.+)/);
		const id = idMatch?.[1]?.trim();
		if (!id) {
			el.createDiv({ cls: 'hoard-widget-error', text: 'Hoard: missing id field.' });
			return;
		}

		const title = this.dataManager.getTitle(id);
		if (!title) {
			el.createDiv({
				cls: 'hoard-widget-error',
				text: `Hoard: title "${id}" not found.`,
			});
			return;
		}

		// register so this widget re-renders on future data changes
		this.widgetRegistry.set(el, id);

		this.renderWidget(el, title);
	}

	private renderWidget(el: HTMLElement, title: HoardTitle): void {
		this.renderWidgetFull(el, title);
	}

	private renderWidgetFull(el: HTMLElement, title: HoardTitle): void {
		el.empty();
		el.addClass('hoard-widget');

		const mainRow = el.createDiv({ cls: 'hoard-widget-main-row' });

		// checkbox 1: visual-only task marker — does NOT modify Hoard data
		const taskCb = mainRow.createEl('input', {
			cls: 'hoard-widget-cb',
			attr: { type: 'checkbox' },
		});
		taskCb.title = 'Personal task marker (does not affect hoard data)';
		taskCb.addEventListener('change', () => {
			const titleSpan = mainRow.querySelector<HTMLElement>('.hoard-widget-title');
			if (titleSpan) {
				titleSpan.style.textDecoration = taskCb.checked ? 'line-through' : '';
				titleSpan.style.opacity = taskCb.checked ? '0.5' : '';
			}
		});

		mainRow.createSpan({ cls: 'hoard-widget-title', text: title.title });

		this.sep(mainRow);

		this.renderBadge(mainRow, title.type, this.plugin.settings.types);

		this.sep(mainRow);

		// status badge (respects coloredTypeBadges)
		this.renderBadge(mainRow, title.status, this.plugin.settings.statuses);

		this.sep(mainRow);

		const progress = this.dataManager.getProgress(title);
		const barWrap = mainRow.createDiv({ cls: 'hoard-widget-bar-wrap' });
		barWrap.createDiv({ cls: 'hoard-progress-bar' }).style.width = `${progress}%`;

		this.sep(mainRow);

		mainRow.createSpan({ cls: 'hoard-widget-percent', text: `${progress}%` });

		this.sep(mainRow);

		const dateStr = title.dateStarted ?? title.dateAdded;
		const dateLabel = title.dateStarted
			? `since ${this.formatShortDate(dateStr)}`
			: `added ${this.formatShortDate(dateStr)}`;
		mainRow.createSpan({ cls: 'hoard-widget-date', text: dateLabel });

		// checkbox 2: "Next up" — writes to Hoard data
		const isMovie = title.type === 'Movie';
		if (!isMovie) {
			const nextEp = this.dataManager.getNextUnwatchedEpisode(title);
			const nextRow = el.createDiv({ cls: 'hoard-widget-next-row' });

			if (nextEp !== null) {
				this.renderEpisodeCheckbox(nextRow, title, {
					episode: nextEp, checked: false, tooltip: `Mark Episode ${nextEp} as watched`, follow: false,
				}, (t) => this.renderWidget(el, t));
				nextRow.createSpan({ cls: 'hoard-widget-next-label', text: `Next up: Ep ${nextEp}` });
			} else {
				nextRow.createSpan({ cls: 'hoard-widget-next-label', text: '✓ All episodes watched' });
			}
		} else {
			// movie: watch checkbox that writes to Hoard data
			const watchRow = el.createDiv({ cls: 'hoard-widget-next-row' });
			const watched = title.watchedEpisodes.includes(1);
			this.renderEpisodeCheckbox(watchRow, title, {
				episode: 1, checked: watched, tooltip: 'Mark movie as watched', follow: true,
			}, (t) => this.renderWidget(el, t));
			watchRow.createSpan({
				cls: 'hoard-widget-next-label',
				text: watched ? 'Watched' : 'Mark as watched',
			});
		}
	}

	private renderWidgetMinimal(el: HTMLElement, title: HoardTitle): void {
		el.empty();
		el.addClass('hoard-widget-minimal');

		const row = el.createDiv({ cls: 'hoard-widget-minimal-row' });

		// left checkbox: visual-only task marker
		const taskCb = row.createEl('input', {
			cls: 'hoard-widget-cb',
			attr: { type: 'checkbox' },
		});
		taskCb.title = 'Personal task marker (does not affect hoard data)';
		taskCb.addEventListener('change', () => {
			const titleSpan = row.querySelector<HTMLElement>('.hoard-widget-title');
			if (titleSpan) {
				titleSpan.style.textDecoration = taskCb.checked ? 'line-through' : '';
				titleSpan.style.opacity = taskCb.checked ? '0.5' : '';
			}
		});

		row.createSpan({ cls: 'hoard-widget-title', text: title.title });

		this.sep(row);

		this.renderBadge(row, title.type, this.plugin.settings.types);

		this.sep(row);

		// status badge (respects coloredTypeBadges)
		this.renderBadge(row, title.status, this.plugin.settings.statuses);

		this.sep(row);

		const progress = this.dataManager.getProgress(title);
		row.createSpan({ cls: 'hoard-widget-percent', text: `${progress}%` });

		this.sep(row);

		// right checkbox: "Mark as watched" / next episode
		const isMovie = title.type === 'Movie';
		if (isMovie) {
			const watched = title.watchedEpisodes.includes(1);
			this.renderEpisodeCheckbox(row, title, {
				episode: 1, checked: watched, tooltip: 'Mark movie as watched', follow: true,
			}, (t) => this.renderWidgetMinimal(el, t));
		} else {
			const nextEp = this.dataManager.getNextUnwatchedEpisode(title);
			if (nextEp !== null) {
				this.renderEpisodeCheckbox(row, title, {
					episode: nextEp, checked: false, tooltip: `Mark Episode ${nextEp} as watched`, follow: false,
				}, (t) => this.renderWidgetMinimal(el, t));
			} else {
				const nextCb = row.createEl('input', {
					cls: 'hoard-widget-next-cb',
					attr: { type: 'checkbox' },
				});
				nextCb.checked = true;
				nextCb.disabled = true;
				nextCb.title = 'All episodes watched';
			}
		}
	}

	/** Type / status badge: coloured from the tag definition when coloured badges are on. */
	private renderBadge(host: HTMLElement, text: string, tags: TagDefinition[]): void {
		const def = this.getTagDef(text, tags);
		const colored = this.plugin.settings.coloredTypeBadges;
		const badge = host.createSpan({
			cls: colored ? 'hoard-badge hoard-badge-sm' : 'hoard-badge-plain',
			text,
		});
		if (colored && def) badge.style.backgroundColor = getThemedColor(text, def.color, this.plugin.settings.colorTheme);
	}

	/**
	 * Checkbox that marks an episode watched. `follow` mirrors the checkbox state (movie toggle);
	 * otherwise it only ever marks the episode as watched (next-up box).
	 */
	private renderEpisodeCheckbox(
		host: HTMLElement,
		title: HoardTitle,
		spec: { episode: number; checked: boolean; tooltip: string; follow: boolean },
		rerender: (updated: HoardTitle) => void,
	): void {
		const cb = host.createEl('input', {
			cls: 'hoard-widget-next-cb',
			attr: { type: 'checkbox' },
		});
		cb.checked = spec.checked;
		cb.title = spec.tooltip;
		cb.addEventListener('change', () => {
			void this.dataManager.markEpisodeWatched(title.id, spec.episode, spec.follow ? cb.checked : true).then(() => {
				const updated = this.dataManager.getTitle(title.id);
				if (updated) rerender(updated);
			});
		});
	}

	/** Soonest future one-off release among the airtime entries. */
	private nextRelease(): NextRelease | null {
		return findNextRelease(this.dataManager.getAirtimeEntries(), this.dataManager.getTitles(), Date.now());
	}

	private getPinned(): { pinnedTitle: HoardTitle | null; pinnedGroup: HoardGroup | null } {
		const pinnedTitle = this.dataManager.getTitles().find((t) => t.pinned) ?? null;
		const pinnedGroupId = this.dataManager.getPinnedGroupId();
		const pinnedGroup = pinnedGroupId
			? this.dataManager.getGroups().find((g) => g.id === pinnedGroupId) ?? null
			: null;
		return { pinnedTitle, pinnedGroup };
	}

	/** Title count and episode progress (%) of a group's member titles. */
	private pinnedGroupStats(group: HoardGroup): { count: number; progress: number } {
		const byId = new Map(this.dataManager.getTitles().map((t) => [t.id, t]));
		const members = group.titleIds
			.map((id) => byId.get(id))
			.filter((t): t is HoardTitle => t !== undefined);
		return {
			count: members.length,
			progress: groupProgress(members, (t) => this.dataManager.getEffectiveTotal(t)),
		};
	}

	private renderNwBarCol(bottomRow: HTMLElement, progress: number): void {
		const barCol = bottomRow.createDiv({ cls: 'hoard-nw-bar-col' });
		barCol.createDiv({ cls: 'hoard-nw-pct', text: `${progress}%` });
		barCol.createDiv({ cls: 'hoard-full-card-bar-wrap' }).createDiv({ cls: 'hoard-full-card-bar' }).style.width = `${progress}%`;
	}

	private sep(parent: HTMLElement): void {
		parent.createSpan({ cls: 'hoard-widget-sep', text: '·' });
	}

	private getTagDef(name: string, tags: TagDefinition[]): TagDefinition | undefined {
		return tags.find((t) => t.name === name);
	}

	private formatShortDate(dateStr: string): string {
		try {
			const d = new Date(dateStr);
			const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			return formatShortDateDisplay(iso);
		} catch {
			return dateStr;
		}
	}

	// hoard-todo

	private processWlTodo(source: string, el: HTMLElement): void {
		const lines = source.trim().split('\n').map((l) => l.trim()).filter(Boolean);
		const isMini = lines.includes('mini');
		const titleName = lines.find((l) => l !== 'mini') ?? '';
		if (!titleName) {
			el.createDiv({ cls: 'hoard-widget-error', text: 'hoard-todo: missing title name.' });
			return;
		}
		const title = this.dataManager.getTitles().find(
			(t) => t.title.toLowerCase() === titleName.toLowerCase(),
		);
		if (!title) {
			el.createDiv({ cls: 'hoard-widget-error', text: `hoard-todo: "${titleName}" not found.` });
			return;
		}
		this.widgetRegistry.set(el, title.id);
		this.widgetMiniRegistry.set(el, isMini);
		if (isMini) {
			this.renderWidgetMinimal(el, title);
		} else {
			this.renderWidget(el, title);
		}
	}

	// hoard-stat

	private processWlStat(source: string, el: HTMLElement): void {
		this.widgetRerender.set(el, () => this.renderWlStat(source, el));
		this.renderWlStat(source, el);
	}

	private renderWlStat(source: string, el: HTMLElement): void {
		const kind = source.trim().toLowerCase();
		el.empty();
		el.addClass('hoard-wstat');

		if (kind === 'watched') {
			const minutes = this.dataManager.getTotalTimeWatched();
			this.renderStatCard(el, '🕐', formatTime(minutes), 'watched');
		} else if (kind === 'completed') {
			const count = this.dataManager.getCompletedCount();
			this.renderStatCard(el, '✅', `${count} titles`, 'completed');
		} else if (kind === 'remaining') {
			const minutes = this.dataManager.getTotalTimeRemaining();
			this.renderStatCard(el, '⏳', formatTime(minutes), 'remaining');
		} else if (kind === 'time') {
			const watched = this.dataManager.getTotalTimeWatched();
			const remaining = this.dataManager.getTotalTimeRemaining();
			this.renderTimeCardMini(el, watched, remaining);
		} else if (kind === 'time full') {
			const watched = this.dataManager.getTotalTimeWatched();
			const remaining = this.dataManager.getTotalTimeRemaining();
			this.renderTimeCardFull(el, watched, remaining);
		} else if (kind === 'completed full') {
			const count = this.dataManager.getCompletedCount();
			this.renderCompletedCardFull(el, count);
		} else if (kind === 'time completed full') {
			const watched = this.dataManager.getTotalTimeWatched();
			const remaining = this.dataManager.getTotalTimeRemaining();
			const count = this.dataManager.getCompletedCount();
			this.renderTripleStatCard(el, watched, remaining, count);
		} else {
			el.createDiv({ cls: 'hoard-widget-error', text: `hoard-stat: unknown stat "${kind}". Use watched, completed, remaining, time, time full, completed full, or time completed full.` });
		}
	}

	private renderStatCard(el: HTMLElement, icon: string, value: string, label: string): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-stat-card' });
		card.createSpan({ cls: 'hoard-stat-icon', text: icon });
		card.createSpan({ cls: 'hoard-stat-value', text: value });
		card.createSpan({ cls: 'hoard-stat-label', text: label });
	}

	private renderTimeCardMini(el: HTMLElement, watchedMins: number, remainingMins: number): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-stat-card hoard-stat-card-time' });
		card.createSpan({ cls: 'hoard-stat-icon', text: '🕐' });
		card.createSpan({ cls: 'hoard-stat-value', text: formatTime(watchedMins) });
		card.createSpan({ cls: 'hoard-stat-label', text: 'watched' });
		card.createSpan({ cls: 'hoard-stat-sep', text: '·' });
		card.createSpan({ cls: 'hoard-stat-icon', text: '⏳' });
		card.createSpan({ cls: 'hoard-stat-value', text: formatTime(remainingMins) });
		card.createSpan({ cls: 'hoard-stat-label', text: 'left' });
	}

	private renderTimeCardFull(el: HTMLElement, watchedMins: number, remainingMins: number): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-full-card hoard-full-card-time' });
		card.createDiv({ cls: 'hoard-full-card-header', text: 'Time' });
		const cols = card.createDiv({ cls: 'hoard-full-card-time-cols' });
		this.renderTimeCol(cols, 'hoard-full-card-time-col', watchedMins, 'watched');
		this.renderTimeCol(cols, 'hoard-full-card-time-col', remainingMins, 'remaining');
	}

	private renderTimeCol(cols: HTMLElement, cls: string, mins: number, label: string): void {
		const col = cols.createDiv({ cls });
		col.createDiv({ cls: 'hoard-full-card-value', text: formatTime(mins) });
		col.createDiv({ cls: 'hoard-full-card-days', text: this.formatTimeDays(mins) });
		col.createDiv({ cls: 'hoard-full-card-sub', text: label });
	}

	private formatTimeDays(minutes: number): string {
		const days = Math.floor(minutes / 1440);
		const hours = Math.floor((minutes % 1440) / 60);
		if (days === 0) return hours > 0 ? `${hours}h` : '0h';
		return `${days} days ${hours}h`;
	}

	private renderCompletedCardFull(el: HTMLElement, count: number): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-full-card' });
		card.createDiv({ cls: 'hoard-full-card-header', text: 'Completed' });
		card.createDiv({ cls: 'hoard-full-card-value', text: String(count) });
		card.createDiv({ cls: 'hoard-full-card-sub', text: 'titles completed' });
	}

	private renderTripleStatCard(el: HTMLElement, watchedMins: number, remainingMins: number, completed: number): void {
		el.empty();
		el.addClass('hoard-wstat-triple');
		const card = el.createDiv({ cls: 'hoard-full-card hoard-full-card-triple' });
		const cols = card.createDiv({ cls: 'hoard-triple-cols' });

		this.renderTimeCol(cols, 'hoard-triple-col', watchedMins, 'watched');
		cols.createDiv({ cls: 'hoard-vert-sep' });
		this.renderTimeCol(cols, 'hoard-triple-col', remainingMins, 'remaining');
		cols.createDiv({ cls: 'hoard-vert-sep' });

		const completedCol = cols.createDiv({ cls: 'hoard-triple-col' });
		completedCol.createDiv({ cls: 'hoard-full-card-value', text: String(completed) });
		completedCol.createDiv({ cls: 'hoard-full-card-sub', text: 'completed' });
	}

	// hoard-upcoming

	private processWlUpcoming(source: string, el: HTMLElement): void {
		this.widgetRerender.set(el, () => this.renderWlUpcoming(source, el));
		this.renderWlUpcoming(source, el);
	}

	private renderWlUpcoming(source: string, el: HTMLElement): void {
		el.empty();
		const kind = source.trim().toLowerCase();
		const isFull = kind === 'next full';
		if (kind !== 'next' && kind !== 'next full') {
			el.createDiv({ cls: 'hoard-widget-error', text: 'hoard-upcoming: only "next" or "next full" is supported.' });
			return;
		}

		// the entry with the soonest future release date
		const bestEntry = this.nextRelease();

		el.addClass('hoard-wupcoming');

		if (isFull) {
			this.renderUpcomingFull(el, bestEntry);
			return;
		}

		if (!bestEntry) {
			el.createDiv({ cls: 'hoard-upcoming-card hoard-upcoming-empty', text: 'No upcoming titles.' });
			return;
		}

		const card = el.createDiv({ cls: 'hoard-upcoming-card' });
		card.createSpan({ cls: 'hoard-upcoming-title', text: bestEntry.titleName });

		this.renderBadge(card, bestEntry.type, this.plugin.settings.types);

		card.createSpan({ cls: 'hoard-upcoming-date', text: formatDateDisplay(bestEntry.releaseDate) });
		const daysUntil = bestEntry.daysUntil;
		const monthSuffix = daysUntil >= 30 ? ` (${Math.round(daysUntil / 30)} month${Math.round(daysUntil / 30) !== 1 ? 's' : ''})` : '';
		const countdown = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days${monthSuffix}`;
		card.createSpan({ cls: 'hoard-upcoming-countdown', text: countdown });
	}

	private renderUpcomingFull(
		el: HTMLElement,
		bestEntry: NextRelease | null,
	): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-full-card' });
		card.createDiv({ cls: 'hoard-full-card-header', text: 'Up Next' });
		if (!bestEntry) {
			card.createDiv({ cls: 'hoard-full-card-sub', text: 'No upcoming titles.' });
			return;
		}
		card.createDiv({ cls: 'hoard-full-card-title', text: bestEntry.titleName });
		const meta = card.createDiv({ cls: 'hoard-full-card-meta' });
		this.renderBadge(meta, bestEntry.type, this.plugin.settings.types);
		const daysUntil = bestEntry.daysUntil;
		const countdown = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
		meta.createSpan({ text: countdown });
		meta.createSpan({ cls: 'hoard-full-card-sub', text: formatDateDisplay(bestEntry.releaseDate) });
	}

	// hoard-nowwatching

	private processWlNowWatching(source: string, el: HTMLElement): void {
		this.widgetRerender.set(el, () => this.renderWlNowWatching(source, el));
		this.renderWlNowWatching(source, el);
	}

	private renderWlNowWatching(source: string, el: HTMLElement): void {
		el.empty();
		const isFull = source.trim().toLowerCase() === 'full';
		el.addClass('hoard-wnowwatching');

		const { pinnedTitle, pinnedGroup } = this.getPinned();

		if (isFull) {
			this.renderNowWatchingFull(el, pinnedTitle, pinnedGroup);
			return;
		}

		if (!pinnedTitle && !pinnedGroup) {
			el.createDiv({ cls: 'hoard-nowwatching-card hoard-nowwatching-empty', text: 'Pin a title to set it as now watching.' });
			return;
		}

		const card = el.createDiv({ cls: 'hoard-nowwatching-card' });

		if (pinnedGroup) {
			card.createSpan({ cls: 'hoard-nowwatching-title', text: pinnedGroup.name });
			const { count, progress } = this.pinnedGroupStats(pinnedGroup);
			card.createSpan({ cls: 'hoard-nowwatching-ep', text: `${count} title${count !== 1 ? 's' : ''}` });
			const barWrap = card.createDiv({ cls: 'hoard-nowwatching-bar-wrap' });
			barWrap.createDiv({ cls: 'hoard-nowwatching-bar' }).style.width = `${progress}%`;
			card.createSpan({ cls: 'hoard-nowwatching-pct', text: `${progress}%` });
			return;
		}

		const pinned = pinnedTitle!;
		card.createSpan({ cls: 'hoard-nowwatching-title', text: pinned.title });

		this.renderBadge(card, pinned.type, this.plugin.settings.types);

		if (pinned.type !== 'Movie') {
			const nextEp = this.dataManager.getNextUnwatchedEpisode(pinned);
			card.createSpan({ cls: 'hoard-nowwatching-ep', text: nextEp !== null ? `Ep ${nextEp}` : '✓ Completed' });
		}

		const progress = this.dataManager.getProgress(pinned);
		const barWrap = card.createDiv({ cls: 'hoard-nowwatching-bar-wrap' });
		const bar = barWrap.createDiv({ cls: 'hoard-nowwatching-bar' });
		bar.style.width = `${progress}%`;
		card.createSpan({ cls: 'hoard-nowwatching-pct', text: `${progress}%` });
	}

	private renderNowWatchingFull(
		el: HTMLElement,
		pinnedTitle: HoardTitle | null,
		pinnedGroup: HoardGroup | null,
	): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-full-card hoard-full-card-nw' });
		card.createDiv({ cls: 'hoard-full-card-header', text: 'NOW WATCHING' });

		if (!pinnedTitle && !pinnedGroup) {
			card.createDiv({ cls: 'hoard-full-card-sub', text: 'Pin a title to set it as now watching.' });
			return;
		}

		if (pinnedGroup) {
			card.createDiv({ cls: 'hoard-full-card-title', text: pinnedGroup.name });
			const { count, progress } = this.pinnedGroupStats(pinnedGroup);
			const bottomRow = card.createDiv({ cls: 'hoard-nw-bottom-row' });
			bottomRow.createSpan({ cls: 'hoard-full-card-sub', text: `${count} title${count !== 1 ? 's' : ''}` });
			this.renderNwBarCol(bottomRow, progress);
			return;
		}

		const pinned = pinnedTitle!;
		card.createDiv({ cls: 'hoard-full-card-title', text: pinned.title });

		const progress = this.dataManager.getProgress(pinned);
		const bottomRow = card.createDiv({ cls: 'hoard-nw-bottom-row' });

		this.renderBadge(bottomRow, pinned.type, this.plugin.settings.types);

		this.renderNwBarCol(bottomRow, progress);
	}

	// hoard-now-next

	private processWlNowNext(source: string, el: HTMLElement): void {
		this.widgetRerender.set(el, () => this.renderWlNowNext(source, el));
		this.renderWlNowNext(source, el);
	}

	private renderWlNowNext(_source: string, el: HTMLElement): void {
		el.empty();
		el.addClass('hoard-wnownext');

		const { pinnedTitle, pinnedGroup } = this.getPinned();

		const bestEntry = this.nextRelease();

		this.renderNowNextCard(el, pinnedTitle, pinnedGroup, bestEntry);
	}

	private renderNowNextCard(
		el: HTMLElement,
		pinnedTitle: HoardTitle | null,
		pinnedGroup: HoardGroup | null,
		bestEntry: NextRelease | null,
	): void {
		el.empty();
		const card = el.createDiv({ cls: 'hoard-full-card hoard-full-card-now-next' });
		const cols = card.createDiv({ cls: 'hoard-double-cols' });

		// left column: Now Watching
		const nowCol = cols.createDiv({ cls: 'hoard-double-col' });
		nowCol.createDiv({ cls: 'hoard-full-card-header', text: 'NOW WATCHING' });

		if (!pinnedTitle && !pinnedGroup) {
			nowCol.createDiv({ cls: 'hoard-full-card-sub', text: 'Nothing pinned.' });
		} else if (pinnedGroup) {
			nowCol.createDiv({ cls: 'hoard-full-card-title', text: pinnedGroup.name });
			const { count, progress } = this.pinnedGroupStats(pinnedGroup);
			nowCol.createDiv({ cls: 'hoard-full-card-sub', text: `${count} title${count !== 1 ? 's' : ''} · ${progress}%` });
		} else {
			const pinned = pinnedTitle!;
			nowCol.createDiv({ cls: 'hoard-full-card-title', text: pinned.title });
			const progress = this.dataManager.getProgress(pinned);
			nowCol.createDiv({ cls: 'hoard-full-card-sub', text: `${progress}%` });
		}

		cols.createDiv({ cls: 'hoard-vert-sep' });

		// right column: Up Next
		const nextCol = cols.createDiv({ cls: 'hoard-double-col' });
		nextCol.createDiv({ cls: 'hoard-full-card-header', text: 'UPCOMING NEXT' });

		if (!bestEntry) {
			nextCol.createDiv({ cls: 'hoard-full-card-sub', text: 'No upcoming.' });
		} else {
			nextCol.createDiv({ cls: 'hoard-full-card-title', text: bestEntry.titleName });
			const daysUntil = bestEntry.daysUntil;
			const countdown = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil}d`;
			nextCol.createDiv({ cls: 'hoard-full-card-sub', text: `${bestEntry.releaseDate} · ${countdown}` });
		}
	}
}
