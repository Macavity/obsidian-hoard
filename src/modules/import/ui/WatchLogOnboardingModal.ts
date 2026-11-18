import { App, Modal, Notice, type TFile } from 'obsidian';
import { t } from './i18n';
import type { SourceCounts, WatchLogSourceKind, WatchLogSources } from './import/watchlog/detect';
import type { ImportDecision } from './import/watchlog/onboardingState';
import { generalErrors, type ImportPhase, type ImportReport, type Progress, type ReviewItem } from './import/watchlog/report';
import type { CleanupItem } from './import/watchlog/cleanup';
import { PLUGIN_NAME, REASONS, reasonLabel, reportMarkdown, reportStats, reviewDetail } from './WatchLogReport';

/** Everything the wizard needs from the import logic; wired to the real implementation in main.ts. */
export interface WatchLogImporter {
	sources: WatchLogSources;
	run(kind: WatchLogSourceKind, progress: Progress): Promise<ImportReport>;
	plan(imported: WatchLogSourceKind[]): Promise<CleanupItem[]>;
	cleanup(items: CleanupItem[]): Promise<{ done: number; errors: string[] }>;
	/** Writes the rendered report as a note. */
	writeReport(markdown: string): Promise<TFile>;
	decide(kind: WatchLogSourceKind, d: ImportDecision): void;
	openFile(path: string): void;
}

export type WizardStep = 'found' | 'import' | 'result' | 'cleanup' | 'done';

const STEPS: WizardStep[] = ['found', 'import', 'result', 'cleanup', 'done'];
/** Fork first: it already carries the migrated data of the original. */
const KIND_ORDER: WatchLogSourceKind[] = ['fork', 'original'];
const COUNT_KEYS: (keyof SourceCounts)[] = ['titles', 'books', 'manga', 'games', 'lists', 'notes'];
const CLEANUP_LABEL = {
	'original-notes': 'originalNotes',
	'fork-notes': 'forkNotes',
	'fork-base': 'forkBase',
	widgets: 'widgets',
} as const;

const isBusy = (step: WizardStep, running: boolean): boolean => step === 'import' || running;
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class WatchLogOnboardingModal extends Modal {
	readonly finished: Promise<void>;
	private resolveFinished!: () => void;
	private current: WizardStep = 'found';
	private cleanupRunning = false;
	/** The window the wizard sits in was closed (only ever another one than the main window). */
	private windowGone = false;
	private selected = new Set<WatchLogSourceKind>();
	private reports: Partial<Record<WatchLogSourceKind, ImportReport>> = {};
	private clean = new Set<WatchLogSourceKind>();
	private plan: CleanupItem[] = [];
	private picked = new Set<CleanupItem['id']>();
	private cleanupResult: { done: number; errors: string[] } | null = null;
	private savedPath = '';
	private progressText: HTMLElement | null = null;
	private progressBar: HTMLProgressElement | null = null;

	constructor(app: App, private importer: WatchLogImporter, private opts: { startAt?: 'found' | 'cleanup'; imported?: WatchLogSourceKind[] } = {}) {
		super(app);
		this.finished = new Promise((r) => { this.resolveFinished = r; });
		const { original, fork } = importer.sources;
		if (fork) this.selected.add('fork');
		else if (original) this.selected.add('original');
		for (const k of opts.imported ?? []) this.clean.add(k);
	}

	get step(): WizardStep { return this.current; }

	/** Kinds the wizard offers, fork first. */
	private get shown(): WatchLogSourceKind[] {
		return KIND_ORDER.filter((k) => this.importer.sources[k]);
	}

	onOpen(): void {
		this.modalEl.addClass('hoard-onboarding');
		// A click outside the dialog must not close it; swallow it before Obsidian's backdrop handler.
		// No `instanceof Node`: Obsidian opens the modal in the active window, and in another one (the
		// settings window) the target is not an instance of this window's Node.
		this.containerEl.addEventListener('click', (e) => {
			if (!this.modalEl.contains(e.target as Node | null)) {
				e.stopImmediatePropagation();
				e.preventDefault();
			}
		}, true);
		// Obsidian closes a modal when its window goes away, which close() refuses while a run is busy.
		// The window is gone all the same: remember it, so the run can end the wizard (afterRun).
		const win = this.containerEl.win;
		if (win !== window) win.addEventListener('pagehide', () => { this.windowGone = true; }, { once: true });
		if (this.opts.startAt === 'cleanup') void this.enterCleanup();
		else this.render();
	}

	/** X and Esc land here; ignored while an import or cleanup runs. */
	close(): void {
		if (isBusy(this.current, this.cleanupRunning)) return;
		super.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolveFinished();
	}

	// ---- shell ----

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.progressText = null;
		this.progressBar = null;
		this.renderHeader(contentEl);
		const body = contentEl.createDiv({ cls: 'hoard-onboarding__body' });
		const renderers: Record<WizardStep, (el: HTMLElement) => void> = {
			found: (el) => this.renderFound(el),
			import: (el) => this.renderImport(el),
			result: (el) => this.renderResult(el),
			cleanup: (el) => this.renderCleanup(el),
			done: (el) => this.renderDone(el),
		};
		renderers[this.current](body);
	}

	private renderHeader(el: HTMLElement): void {
		el.createEl('h2', { cls: 'hoard-onboarding__title', text: t('onboarding.title') });
		const nav = el.createDiv({ cls: 'hoard-onboarding__steps' });
		const at = STEPS.indexOf(this.current);
		STEPS.forEach((s, i) => {
			const cls = ['hoard-onboarding__step', i < at ? 'is-done' : '', i === at ? 'is-active' : ''].filter(Boolean).join(' ');
			nav.createSpan({ cls, text: t(`onboarding.steps.${s}`) });
		});
	}

	private button(row: HTMLElement, action: string, label: string, opts: { primary?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
		const btn = row.createEl('button', { cls: opts.primary ? 'hoard-btn hoard-btn--primary' : 'hoard-btn', text: label });
		btn.setAttribute('data-action', action);
		btn.disabled = opts.disabled === true;
		return btn;
	}

	private go(step: WizardStep): void {
		this.current = step;
		this.render();
	}

	/**
	 * Shows `step` once a run is over. With the wizard's window closed meanwhile nobody can see or
	 * click it: the outcome goes into a notice and the wizard ends, so Hoard's start is not left waiting.
	 */
	private afterRun(step: WizardStep, summary: () => string[]): void {
		if (!this.windowGone) {
			this.go(step);
			return;
		}
		this.current = step;
		new Notice([t('onboarding.title'), ...summary()].join('\n'), 0);
		this.close();
	}

	// ---- step 1: found ----

	private renderFound(el: HTMLElement): void {
		if (this.shown.length === 0) {
			el.createEl('p', { text: t('onboarding.none') });
			this.button(el.createDiv({ cls: 'hoard-modal__btn-row' }), 'close', t('onboarding.buttons.close')).addEventListener('click', () => this.close());
			return;
		}
		el.createEl('p', { text: t('onboarding.found.intro') });
		for (const kind of this.shown) this.renderSourceRow(el, kind);
		this.renderFoundHints(el);
		this.renderFoundButtons(el);
	}

	private countsText(counts: SourceCounts): string {
		return COUNT_KEYS.filter((k) => counts[k] > 0).map((k) => t(`onboarding.counts.${k}`, { count: counts[k] })).join(', ');
	}

	private renderSourceRow(el: HTMLElement, kind: WatchLogSourceKind): void {
		const source = this.importer.sources[kind];
		if (!source) return;
		const label = el.createEl('label', { cls: 'hoard-onboarding__source' });
		const box = label.createEl('input', { attr: { type: 'checkbox' } });
		box.setAttribute('data-source', kind);
		box.checked = this.selected.has(kind);
		box.addEventListener('change', () => {
			if (box.checked) this.selected.add(kind); else this.selected.delete(kind);
			this.syncImportButton(el);
		});
		label.createSpan({ cls: 'hoard-onboarding__source-name', text: PLUGIN_NAME[kind] });
		label.createSpan({ cls: 'hoard-onboarding__source-counts', text: this.countsText(source.counts) });
	}

	private syncImportButton(el: HTMLElement): void {
		const btn = el.querySelector<HTMLButtonElement>('[data-action="import"]');
		if (btn) btn.disabled = this.selected.size === 0;
	}

	private renderFoundHints(el: HTMLElement): void {
		const { original, fork, hoardData } = { ...this.importer.sources, hoardData: this.importer.sources.hoardHasData };
		const hint = (text: string): void => { el.createEl('p', { cls: 'hoard-onboarding__hint', text }); };
		if (original && fork) hint(t('onboarding.found.forkHint'));
		if (hoardData) hint(t('onboarding.found.hoardData'));
		for (const kind of this.shown) {
			if (this.importer.sources[kind]?.pluginEnabled) hint(t('onboarding.found.pluginEnabled', { plugin: PLUGIN_NAME[kind] }));
		}
	}

	private renderFoundButtons(el: HTMLElement): void {
		const row = el.createDiv({ cls: 'hoard-modal__btn-row' });
		this.button(row, 'decline', t('onboarding.buttons.decline')).addEventListener('click', () => {
			for (const kind of this.shown) this.importer.decide(kind, 'declined');
			this.close();
		});
		this.button(row, 'later', t('onboarding.buttons.later')).addEventListener('click', () => this.close());
		this.button(row, 'import', t('onboarding.buttons.import'), { primary: true, disabled: this.selected.size === 0 })
			.addEventListener('click', () => { void this.runImport(KIND_ORDER.filter((k) => this.selected.has(k))); });
	}

	// ---- step 2: import ----

	private renderImport(el: HTMLElement): void {
		el.createEl('p', { text: t('onboarding.running') });
		this.progressBar = el.createEl('progress', { cls: 'hoard-onboarding__progress' });
		this.progressText = el.createDiv({ cls: 'hoard-onboarding__progress-text' });
	}

	private onProgress: Progress = (phase: ImportPhase, done: number, total: number) => {
		if (this.progressText) this.progressText.textContent = t('onboarding.progress', { phase: t(`onboarding.phase.${phase}`), done, total });
		if (this.progressBar) {
			this.progressBar.max = Math.max(total, 1);
			this.progressBar.value = done;
		}
	};

	private async runImport(kinds: WatchLogSourceKind[]): Promise<void> {
		this.go('import');
		for (const kind of kinds) {
			try {
				this.reports[kind] = await this.importer.run(kind, this.onProgress);
			} catch (e) {
				this.reports[kind] = { created: 0, filled: 0, review: [], errors: [e instanceof Error ? e.message : String(e)] };
			}
			if (this.reports[kind]?.errors.length === 0) {
				this.clean.add(kind);
				this.importer.decide(kind, 'imported');
			} else {
				this.clean.delete(kind);
			}
		}
		this.afterRun('result', () => this.importSummary());
	}

	/** The result step in short: counts per source, then what is left to do. */
	private importSummary(): string[] {
		const lines = KIND_ORDER.flatMap((kind) => {
			const report = this.reports[kind];
			return report ? [`${PLUGIN_NAME[kind]}: ${reportStats(report)}`] : [];
		});
		return [...lines, t(this.failed().length > 0 ? 'onboarding.result.retryHint' : 'onboarding.done.skipped')];
	}

	// ---- step 3: result ----

	private failed(): WatchLogSourceKind[] {
		return KIND_ORDER.filter((k) => (this.reports[k]?.errors.length ?? 0) > 0);
	}

	private renderResult(el: HTMLElement): void {
		let index = 0;
		for (const kind of KIND_ORDER) {
			const report = this.reports[kind];
			if (!report) continue;
			index = this.renderSourceResult(el, kind, report, index);
		}
		this.renderResultButtons(el);
	}

	private renderSourceResult(el: HTMLElement, kind: WatchLogSourceKind, report: ImportReport, start: number): number {
		const section = el.createDiv({ cls: 'hoard-onboarding__result' });
		section.createEl('h3', { text: PLUGIN_NAME[kind] });
		section.createDiv({ cls: 'hoard-onboarding__stats', text: reportStats(report) });
		// per-file errors show below as review items
		for (const err of generalErrors(report)) section.createDiv({ cls: 'hoard-onboarding__error', text: err });
		if (report.errors.length > 0) {
			section.createEl('p', { cls: 'hoard-onboarding__hint', text: t('onboarding.result.retryHint') });
			section.createEl('p', { cls: 'hoard-onboarding__hint', text: t('onboarding.result.cleanupLocked') });
		}
		return this.renderReview(section, report.review, start);
	}

	private renderReview(el: HTMLElement, items: ReviewItem[], start: number): number {
		if (items.length === 0) return start;
		el.createEl('h4', { text: t('onboarding.result.reviewHeading') });
		let index = start;
		for (const reason of REASONS) {
			const group = items.map((item, i) => ({ item, i: start + i })).filter(({ item }) => item.reason === reason);
			if (group.length === 0) continue;
			el.createDiv({ cls: 'hoard-onboarding__reason', text: reasonLabel(reason) });
			for (const { item, i } of group) this.renderReviewLink(el, item, i);
		}
		index += items.length;
		return index;
	}

	private renderReviewLink(el: HTMLElement, item: ReviewItem, i: number): void {
		const row = el.createDiv({ cls: 'hoard-onboarding__review-row' });
		const link = row.createEl('button', { cls: 'hoard-onboarding__review-link', text: item.path });
		link.setAttribute('data-action', `review-link-${i}`);
		link.addEventListener('click', () => this.importer.openFile(item.path));
		const detail = reviewDetail(item);
		if (detail) row.createSpan({ cls: 'hoard-onboarding__review-detail', text: detail });
	}

	private renderResultButtons(el: HTMLElement): void {
		if (this.savedPath) el.createDiv({ cls: 'hoard-onboarding__hint', text: t('onboarding.result.reportSaved', { path: this.savedPath }) });
		const row = el.createDiv({ cls: 'hoard-modal__btn-row' });
		this.button(row, 'report', t('onboarding.buttons.report')).addEventListener('click', () => { void this.saveReport(); });
		if (this.failed().length > 0) {
			this.button(row, 'retry', t('onboarding.buttons.retry')).addEventListener('click', () => { void this.runImport(this.failed()); });
		}
		if (this.clean.size > 0 && this.failed().length === 0) {
			this.button(row, 'next', t('onboarding.buttons.next'), { primary: true }).addEventListener('click', () => { void this.enterCleanup(); });
		} else {
			this.button(row, 'close', t('onboarding.buttons.close')).addEventListener('click', () => this.close());
		}
	}

	private async saveReport(): Promise<void> {
		try {
			const file = await this.importer.writeReport(reportMarkdown(this.reports));
			this.savedPath = file.path;
			new Notice(t('onboarding.result.reportSaved', { path: file.path }));
		} catch (e) {
			new Notice(t('onboarding.result.reportFailed', { message: errorText(e) }));
		}
		this.render();
	}

	// ---- step 4: cleanup ----

	private async enterCleanup(): Promise<void> {
		try {
			this.plan = await this.importer.plan(KIND_ORDER.filter((k) => this.clean.has(k)));
		} catch (e) {
			// stay where the user was; "Next" (or the settings entry) tries again
			new Notice(t('onboarding.cleanup.planFailed', { message: errorText(e) }));
			return;
		}
		this.current = 'cleanup';
		this.picked.clear();
		this.render();
	}

	private renderCleanup(el: HTMLElement): void {
		const row = el.createDiv({ cls: 'hoard-modal__btn-row' });
		if (this.plan.length === 0) {
			el.createEl('p', { text: t('onboarding.cleanup.none') });
			el.appendChild(row);
			this.button(row, 'skip', t('onboarding.buttons.close')).addEventListener('click', () => this.go('done'));
			return;
		}
		el.createEl('p', { text: t('onboarding.cleanup.intro') });
		for (const item of this.plan) this.renderCleanupItem(el, item);
		el.appendChild(row);
		const disabled = this.cleanupRunning;
		this.button(row, 'skip', t('onboarding.buttons.skip'), { disabled }).addEventListener('click', () => this.skipCleanup());
		this.button(row, 'cleanup-run', t('onboarding.buttons.cleanupRun'), { primary: true, disabled })
			.addEventListener('click', () => { void this.runCleanup(); });
	}

	private renderCleanupItem(el: HTMLElement, item: CleanupItem): void {
		const wrap = el.createDiv({ cls: 'hoard-onboarding__cleanup-item' });
		const label = wrap.createEl('label', { cls: 'hoard-onboarding__source' });
		const box = label.createEl('input', { attr: { type: 'checkbox' } });
		box.setAttribute('data-cleanup', item.id);
		box.checked = this.picked.has(item.id);
		box.addEventListener('change', () => {
			if (box.checked) this.picked.add(item.id); else this.picked.delete(item.id);
		});
		label.createSpan({ cls: 'hoard-onboarding__source-name', text: t(`onboarding.cleanup.items.${CLEANUP_LABEL[item.id]}`) });
		label.createSpan({ cls: 'hoard-onboarding__source-counts', text: t('onboarding.cleanup.files', { count: item.paths.length }) });
		this.renderCleanupWarnings(wrap, item);
		const details = wrap.createEl('details', { cls: 'hoard-onboarding__paths' });
		details.createEl('summary', { text: t('onboarding.cleanup.files', { count: item.paths.length }) });
		for (const path of item.paths) details.createDiv({ cls: 'hoard-onboarding__path', text: path });
	}

	private renderCleanupWarnings(wrap: HTMLElement, item: CleanupItem): void {
		const warn = (text: string): void => { wrap.createDiv({ cls: 'hoard-onboarding__warning', text }); };
		if (item.id === 'widgets') warn(t('onboarding.cleanup.widgetsWarning'));
		const enabledKind = item.id === 'original-notes' ? 'original' : item.id === 'fork-notes' ? 'fork' : null;
		if (enabledKind && this.importer.sources[enabledKind]?.pluginEnabled) {
			warn(t('onboarding.cleanup.pluginEnabled', { plugin: PLUGIN_NAME[enabledKind] }));
		}
	}

	private skipCleanup(): void {
		if (this.cleanupRunning) return;
		this.cleanupResult = null;
		this.go('done');
	}

	private async runCleanup(): Promise<void> {
		if (this.cleanupRunning) return;
		const items = this.plan.filter((i) => this.picked.has(i.id));
		this.cleanupRunning = true;
		this.render();
		try {
			this.cleanupResult = await this.importer.cleanup(items);
		} catch (e) {
			this.cleanupResult = { done: 0, errors: [e instanceof Error ? e.message : String(e)] };
		} finally {
			this.cleanupRunning = false;
		}
		this.afterRun('done', () => this.cleanupSummary());
	}

	private cleanupSummary(): string[] {
		const res = this.cleanupResult ?? { done: 0, errors: [] };
		const done = t('onboarding.done.cleanupDone', { count: res.done });
		return res.errors.length > 0 ? [done, t('onboarding.done.cleanupErrors', { count: res.errors.length })] : [done];
	}

	// ---- step 5: done ----

	private renderDone(el: HTMLElement): void {
		const res = this.cleanupResult;
		if (res) {
			el.createEl('p', { text: t('onboarding.done.cleanupDone', { count: res.done }) });
			if (res.errors.length > 0) {
				el.createEl('p', { text: t('onboarding.done.cleanupErrors', { count: res.errors.length }) });
				for (const err of res.errors) el.createDiv({ cls: 'hoard-onboarding__error', text: err });
			}
		} else {
			el.createEl('p', { text: t('onboarding.done.skipped') });
		}
		el.createEl('p', { cls: 'hoard-onboarding__hint', text: t('onboarding.done.uninstall') });
		this.button(el.createDiv({ cls: 'hoard-modal__btn-row' }), 'close', t('onboarding.buttons.close'), { primary: true })
			.addEventListener('click', () => this.close());
	}
}
