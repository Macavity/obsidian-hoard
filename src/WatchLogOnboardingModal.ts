import { App, Modal, Notice, type TFile } from 'obsidian';
import { t } from './i18n';
import type { SourceCounts, WatchLogSourceKind, WatchLogSources } from './import/watchlog/detect';
import type { ImportDecision } from './import/watchlog/onboardingState';
import type { ImportPhase, ImportReport, Progress, ReviewItem } from './import/watchlog/report';
import type { CleanupItem } from './import/watchlog/cleanup';

/** Everything the wizard needs from the import logic; wired to the real implementation in main.ts. */
export interface WatchLogImporter {
	sources: WatchLogSources;
	run(kind: WatchLogSourceKind, progress: Progress): Promise<ImportReport>;
	plan(imported: WatchLogSourceKind[]): Promise<CleanupItem[]>;
	cleanup(items: CleanupItem[]): Promise<{ done: number; errors: string[] }>;
	writeReport(reports: Partial<Record<WatchLogSourceKind, ImportReport>>): Promise<TFile>;
	decide(kind: WatchLogSourceKind, d: ImportDecision): void;
	openFile(path: string): void;
}

export type WizardStep = 'found' | 'import' | 'result' | 'cleanup' | 'done';

const STEPS: WizardStep[] = ['found', 'import', 'result', 'cleanup', 'done'];
/** Fork first: it already carries the migrated data of the original. */
const KIND_ORDER: WatchLogSourceKind[] = ['fork', 'original'];
const COUNT_KEYS: (keyof SourceCounts)[] = ['titles', 'books', 'manga', 'games', 'lists', 'notes'];
const REASON_KEY = { exists: 'exists', 'kept-value': 'keptValue', error: 'error' } as const;
const CLEANUP_LABEL = {
	'original-notes': 'originalNotes',
	'fork-notes': 'forkNotes',
	'fork-base': 'forkBase',
	widgets: 'widgets',
} as const;

/** Product names, not translated. */
const PLUGIN_NAME: Record<WatchLogSourceKind, string> = { original: 'WatchLog', fork: 'WatchLog Sync' };

const isBusy = (step: WizardStep, running: boolean): boolean => step === 'import' || running;

export class WatchLogOnboardingModal extends Modal {
	readonly finished: Promise<void>;
	private resolveFinished!: () => void;
	private current: WizardStep = 'found';
	private cleanupRunning = false;
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
		this.modalEl.addClass('hoard-onboarding-modal');
		// A click outside the dialog must not close it; swallow it before Obsidian's backdrop handler.
		this.containerEl.addEventListener('click', (e) => {
			if (!(e.target instanceof Node) || !this.modalEl.contains(e.target)) {
				e.stopImmediatePropagation();
				e.preventDefault();
			}
		}, true);
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
		const body = contentEl.createDiv({ cls: 'hoard-onboarding-body' });
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
		el.createEl('h2', { cls: 'hoard-onboarding-title', text: t('onboarding.title') });
		const nav = el.createDiv({ cls: 'hoard-onboarding-steps' });
		const at = STEPS.indexOf(this.current);
		STEPS.forEach((s, i) => {
			const cls = ['hoard-onboarding-step', i < at ? 'is-done' : '', i === at ? 'is-active' : ''].filter(Boolean).join(' ');
			nav.createSpan({ cls, text: t(`onboarding.steps.${s}`) });
		});
	}

	private button(row: HTMLElement, action: string, label: string, opts: { primary?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
		const btn = row.createEl('button', { cls: opts.primary ? 'hoard-btn hoard-btn-primary' : 'hoard-btn', text: label });
		btn.setAttribute('data-action', action);
		btn.disabled = opts.disabled === true;
		return btn;
	}

	private go(step: WizardStep): void {
		this.current = step;
		this.render();
	}

	// ---- step 1: found ----

	private renderFound(el: HTMLElement): void {
		if (this.shown.length === 0) {
			el.createEl('p', { text: t('onboarding.none') });
			this.button(el.createDiv({ cls: 'hoard-modal-btn-row' }), 'close', t('onboarding.buttons.close')).addEventListener('click', () => this.close());
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
		const label = el.createEl('label', { cls: 'hoard-onboarding-source' });
		const box = label.createEl('input', { attr: { type: 'checkbox' } });
		box.setAttribute('data-source', kind);
		box.checked = this.selected.has(kind);
		box.addEventListener('change', () => {
			if (box.checked) this.selected.add(kind); else this.selected.delete(kind);
			this.syncImportButton(el);
		});
		label.createSpan({ cls: 'hoard-onboarding-source-name', text: PLUGIN_NAME[kind] });
		label.createSpan({ cls: 'hoard-onboarding-source-counts', text: this.countsText(source.counts) });
	}

	private syncImportButton(el: HTMLElement): void {
		const btn = el.querySelector<HTMLButtonElement>('[data-action="import"]');
		if (btn) btn.disabled = this.selected.size === 0;
	}

	private renderFoundHints(el: HTMLElement): void {
		const { original, fork, hoardData } = { ...this.importer.sources, hoardData: this.importer.sources.hoardHasData };
		const hint = (text: string): void => { el.createEl('p', { cls: 'hoard-onboarding-hint', text }); };
		if (original && fork) hint(t('onboarding.found.forkHint'));
		if (hoardData) hint(t('onboarding.found.hoardData'));
		for (const kind of this.shown) {
			if (this.importer.sources[kind]?.pluginEnabled) hint(t('onboarding.found.pluginEnabled', { plugin: PLUGIN_NAME[kind] }));
		}
	}

	private renderFoundButtons(el: HTMLElement): void {
		const row = el.createDiv({ cls: 'hoard-modal-btn-row' });
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
		this.progressBar = el.createEl('progress', { cls: 'hoard-onboarding-progress' });
		this.progressText = el.createDiv({ cls: 'hoard-onboarding-progress-text' });
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
		this.go('result');
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
		const section = el.createDiv({ cls: 'hoard-onboarding-result' });
		section.createEl('h3', { text: PLUGIN_NAME[kind] });
		const stats = [
			t('onboarding.result.created', { count: report.created }),
			t('onboarding.result.filled', { count: report.filled }),
			t('onboarding.result.review', { count: report.review.length }),
			t('onboarding.result.errors', { count: report.errors.length }),
		];
		section.createDiv({ cls: 'hoard-onboarding-stats', text: stats.join(' · ') });
		for (const err of report.errors) section.createDiv({ cls: 'hoard-onboarding-error', text: err });
		if (report.errors.length > 0) {
			section.createEl('p', { cls: 'hoard-onboarding-hint', text: t('onboarding.result.retryHint') });
			section.createEl('p', { cls: 'hoard-onboarding-hint', text: t('onboarding.result.cleanupLocked') });
		}
		return this.renderReview(section, report.review, start);
	}

	private renderReview(el: HTMLElement, items: ReviewItem[], start: number): number {
		if (items.length === 0) return start;
		el.createEl('h4', { text: t('onboarding.result.reviewHeading') });
		let index = start;
		for (const reason of ['exists', 'kept-value', 'error'] as const) {
			const group = items.map((item, i) => ({ item, i: start + i })).filter(({ item }) => item.reason === reason);
			if (group.length === 0) continue;
			el.createDiv({ cls: 'hoard-onboarding-reason', text: t(`onboarding.result.reasons.${REASON_KEY[reason]}`) });
			for (const { item, i } of group) this.renderReviewLink(el, item, i);
		}
		index += items.length;
		return index;
	}

	private renderReviewLink(el: HTMLElement, item: ReviewItem, i: number): void {
		const row = el.createDiv({ cls: 'hoard-onboarding-review-row' });
		const link = row.createEl('button', { cls: 'hoard-onboarding-review-link', text: item.path });
		link.setAttribute('data-action', `review-link-${i}`);
		link.addEventListener('click', () => this.importer.openFile(item.path));
		if (item.detail) row.createSpan({ cls: 'hoard-onboarding-review-detail', text: item.detail });
	}

	private renderResultButtons(el: HTMLElement): void {
		if (this.savedPath) el.createDiv({ cls: 'hoard-onboarding-hint', text: t('onboarding.result.reportSaved', { path: this.savedPath }) });
		const row = el.createDiv({ cls: 'hoard-modal-btn-row' });
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
		const file = await this.importer.writeReport(this.reports);
		this.savedPath = file.path;
		new Notice(t('onboarding.result.reportSaved', { path: file.path }));
		this.render();
	}

	// ---- step 4: cleanup ----

	private async enterCleanup(): Promise<void> {
		this.current = 'cleanup';
		this.plan = await this.importer.plan(KIND_ORDER.filter((k) => this.clean.has(k)));
		this.picked.clear();
		this.render();
	}

	private renderCleanup(el: HTMLElement): void {
		const row = el.createDiv({ cls: 'hoard-modal-btn-row' });
		if (this.plan.length === 0) {
			el.createEl('p', { text: t('onboarding.cleanup.none') });
			el.appendChild(row);
			this.button(row, 'skip', t('onboarding.buttons.close')).addEventListener('click', () => this.go('done'));
			return;
		}
		el.createEl('p', { text: t('onboarding.cleanup.intro') });
		for (const item of this.plan) this.renderCleanupItem(el, item);
		el.appendChild(row);
		this.button(row, 'skip', t('onboarding.buttons.skip')).addEventListener('click', () => this.skipCleanup());
		this.button(row, 'cleanup-run', t('onboarding.buttons.cleanupRun'), { primary: true }).addEventListener('click', () => { void this.runCleanup(); });
	}

	private renderCleanupItem(el: HTMLElement, item: CleanupItem): void {
		const wrap = el.createDiv({ cls: 'hoard-onboarding-cleanup-item' });
		const label = wrap.createEl('label', { cls: 'hoard-onboarding-source' });
		const box = label.createEl('input', { attr: { type: 'checkbox' } });
		box.setAttribute('data-cleanup', item.id);
		box.checked = this.picked.has(item.id);
		box.addEventListener('change', () => {
			if (box.checked) this.picked.add(item.id); else this.picked.delete(item.id);
		});
		label.createSpan({ cls: 'hoard-onboarding-source-name', text: t(`onboarding.cleanup.items.${CLEANUP_LABEL[item.id]}`) });
		label.createSpan({ cls: 'hoard-onboarding-source-counts', text: t('onboarding.cleanup.files', { count: item.paths.length }) });
		this.renderCleanupWarnings(wrap, item);
		const details = wrap.createEl('details', { cls: 'hoard-onboarding-paths' });
		details.createEl('summary', { text: t('onboarding.cleanup.files', { count: item.paths.length }) });
		for (const path of item.paths) details.createDiv({ cls: 'hoard-onboarding-path', text: path });
	}

	private renderCleanupWarnings(wrap: HTMLElement, item: CleanupItem): void {
		const warn = (text: string): void => { wrap.createDiv({ cls: 'hoard-onboarding-warning', text }); };
		if (item.id === 'widgets') warn(t('onboarding.cleanup.widgetsWarning'));
		const enabledKind = item.id === 'original-notes' ? 'original' : item.id === 'fork-notes' ? 'fork' : null;
		if (enabledKind && this.importer.sources[enabledKind]?.pluginEnabled) {
			warn(t('onboarding.cleanup.pluginEnabled', { plugin: PLUGIN_NAME[enabledKind] }));
		}
	}

	private skipCleanup(): void {
		this.cleanupResult = null;
		this.go('done');
	}

	private async runCleanup(): Promise<void> {
		const items = this.plan.filter((i) => this.picked.has(i.id));
		this.cleanupRunning = true;
		try {
			this.cleanupResult = await this.importer.cleanup(items);
		} catch (e) {
			this.cleanupResult = { done: 0, errors: [e instanceof Error ? e.message : String(e)] };
		} finally {
			this.cleanupRunning = false;
		}
		this.go('done');
	}

	// ---- step 5: done ----

	private renderDone(el: HTMLElement): void {
		const res = this.cleanupResult;
		if (res) {
			el.createEl('p', { text: t('onboarding.done.cleanupDone', { count: res.done }) });
			if (res.errors.length > 0) {
				el.createEl('p', { text: t('onboarding.done.cleanupErrors', { count: res.errors.length }) });
				for (const err of res.errors) el.createDiv({ cls: 'hoard-onboarding-error', text: err });
			}
		} else {
			el.createEl('p', { text: t('onboarding.done.skipped') });
		}
		el.createEl('p', { cls: 'hoard-onboarding-hint', text: t('onboarding.done.uninstall') });
		this.button(el.createDiv({ cls: 'hoard-modal-btn-row' }), 'close', t('onboarding.buttons.close'), { primary: true })
			.addEventListener('click', () => this.close());
	}
}
