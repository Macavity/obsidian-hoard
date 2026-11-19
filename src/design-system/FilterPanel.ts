/**
 * The shared "Filters ▼" popover: collapsible sections of checkbox options with a ◆ All toggle,
 * optional boolean rows per section (✦ Recently arrived / Empty / ◇ Groups only), the ♥ Favorites
 * row, Select/Deselect all, a Save-or-Delete preset button, and draft + Apply semantics — the
 * caller's live filter state is never mutated until Apply. Used by ListTab and GamesTab.
 *
 * The caller owns the draft: section `excludeSet`s and the toggles' get/set closures all point into
 * a draft object built fresh on open; onApply commits it.
 */

import { t } from '../shared/i18n';
import { excludeAllOptions, includeAllOptions, isSectionAllIncluded, toggleSectionAll } from './filterDraft';

/** A boolean toggle row rendered inside a section, under its ◆ All row. */
export interface FilterSpecialToggle {
	text: string;
	/** Class for the label span (e.g. hoard-filter-panel__recently-arrived-filter). */
	spanCls?: string;
	get: () => boolean;
	set: (v: boolean) => void;
	/**
	 * 'exclusive' — checking it clears the section's excludes and re-checks its option boxes; touching
	 * any option row unchecks it (Recently arrived, Empty). 'independent' — a plain toggle.
	 */
	mode: 'exclusive' | 'independent';
	/** Reset (to false) by Select all / Deselect all — Recently arrived is, Empty and Groups only aren't. */
	resetOnGlobal?: boolean;
	/** Draw a section divider after this row (the Groups-only look). */
	dividerAfter?: boolean;
}

export interface FilterSection {
	label: string;
	opts: string[];
	/** Draft exclude set — mutated live by the checkboxes. */
	excludeSet: Set<string>;
	/** Display formatting for option labels (e.g. 4.5★ → 4½★). */
	formatOpt?: (opt: string) => string;
	specials?: FilterSpecialToggle[];
}

export interface FilterPanelConfig {
	/** The Filters button — the panel opens under it. */
	anchor: HTMLElement;
	/** Clicks inside this element (the button wrap) don't close the panel. */
	outsideGuard: HTMLElement;
	sections: FilterSection[];
	/** The ♥ Favorites row above the sections; reset by Select/Deselect all. */
	favorites?: { get: () => boolean; set: (v: boolean) => void };
	/** Further standalone boolean rows below Favorites (Games' 🎁 Wishlist), same behaviour. */
	standaloneRows?: Array<{
		text: string;
		spanCls?: string;
		get: () => boolean;
		set: (v: boolean) => void;
	}>;
	/** Whether a preset exists — decides the Save vs Delete button. */
	presetExists: boolean;
	onPresetSave: () => void | Promise<void>;
	onPresetDelete: () => void | Promise<void>;
	/** Called after save/delete completed (the panel is already removed). */
	onPresetChanged: () => void;
	/** Commit the draft to live state and re-render; panel closes itself. */
	onApply: () => void;
	/**
	 * Hands the caller a teardown to run on re-render / view close (the tab's `activeCleanups`
	 * array). The panel lives in document.body, so without it a popover left open when its tab goes
	 * away outlives the tab along with its document-level mousedown listener.
	 */
	registerCleanup?: (fn: () => void) => void;
}

/**
 * The "◆ All" checkbox row at the top of a filter section. A click anywhere on the row runs
 * `onToggle`; the checkbox's native toggle is cancelled because the caller drives its state.
 */
export function renderAllToggleRow(content: HTMLElement, onToggle: () => void): HTMLInputElement {
	const allRow = content.createDiv({ cls: 'hoard-filter-panel__checkbox-row' });
	const allCb = allRow.createEl('input', { attr: { type: 'checkbox' } });
	allRow.createSpan({ cls: 'hoard-filter-panel__all-toggle', text: `◆ ${t('ui.toolbar.all')}` });
	allCb.addEventListener('click', (ev) => { ev.stopPropagation(); onToggle(); });
	allRow.addEventListener('click', (ev) => {
		if (ev.target === allCb) return;
		ev.stopPropagation();
		onToggle();
	});
	return allCb;
}

/** Shared state of one open panel, threaded through the render helpers. */
interface PanelCtx {
	panel: HTMLElement;
	cfg: FilterPanelConfig;
	closePanel: () => void;
	/** Every option checkbox with the draft entry it mirrors, re-derived after draft operations. */
	optionRefs: OptionRef[];
	/** Specials that Select all / Deselect all reset, plus the favorites and standalone rows. */
	globalResetRefs: ToggleRef[];
}

interface OptionRef { cb: HTMLInputElement; excludeSet: Set<string>; opt: string }
interface ToggleRef { cb: HTMLInputElement; set: (v: boolean) => void }

function syncOptionCheckboxes(refs: readonly OptionRef[]): void {
	for (const { cb, excludeSet, opt } of refs) cb.checked = !excludeSet.has(opt);
}

function uncheckToggles(refs: readonly ToggleRef[]): void {
	for (const ref of refs) {
		ref.set(false);
		ref.cb.checked = false;
	}
}

function renderGlobalButtons(ctx: PanelCtx): void {
	const { panel, cfg } = ctx;
	const globalRow = panel.createDiv({ cls: 'hoard-filter-panel__global-btns' });

	const selectAllBtn = globalRow.createEl('button', { cls: 'hoard-btn hoard-btn--sm', text: t('list.filter.selectAll') });
	selectAllBtn.addEventListener('click', (ev) => {
		ev.stopPropagation();
		includeAllOptions(cfg.sections);
		syncOptionCheckboxes(ctx.optionRefs);
		uncheckToggles(ctx.globalResetRefs);
	});
	const deselectAllBtn = globalRow.createEl('button', { cls: 'hoard-btn hoard-btn--sm', text: t('ui.toolbar.deselectAll') });
	deselectAllBtn.addEventListener('click', (ev) => {
		ev.stopPropagation();
		excludeAllOptions(cfg.sections);
		syncOptionCheckboxes(ctx.optionRefs);
		uncheckToggles(ctx.globalResetRefs);
	});

	// Save / Delete preset button
	const saveDeleteBtn = globalRow.createEl('button', {
		cls: 'hoard-btn hoard-btn--sm',
		text: cfg.presetExists ? t('common.delete') : t('common.save'),
	});
	saveDeleteBtn.addEventListener('click', (ev) => {
		void (async () => {
			ev.stopPropagation();
			if (!cfg.presetExists) {
				await cfg.onPresetSave();
			} else {
				await cfg.onPresetDelete();
			}
			ctx.closePanel();
			cfg.onPresetChanged();
		})();
	});
}

/** The ♥ Favorites row and further standalone boolean rows, all reset by Select/Deselect all. */
function renderStandaloneRows(ctx: PanelCtx): void {
	const { panel, cfg } = ctx;
	const rows: Array<{ spanCls?: string; text: string; get: () => boolean; set: (v: boolean) => void }> = [];
	if (cfg.favorites) {
		rows.push({ spanCls: 'hoard-filter-panel__favorites-filter', text: `♥ ${t('list.shelves.favorites')}`, ...cfg.favorites });
	}
	rows.push(...(cfg.standaloneRows ?? []));

	for (const row of rows) {
		const rowEl = panel.createDiv({ cls: 'hoard-filter-panel__checkbox-row hoard-filter-panel__checkbox-row--favorites' });
		const cb = rowEl.createEl('input', { attr: { type: 'checkbox' } });
		cb.checked = row.get();
		rowEl.createSpan(row.spanCls ? { cls: row.spanCls, text: row.text } : { text: row.text });
		cb.addEventListener('change', () => { row.set(cb.checked); });
		ctx.globalResetRefs.push({ cb, set: row.set });
	}
}

/** One boolean special row inside a section's content. */
function renderSpecial(
	ctx: PanelCtx,
	content: HTMLElement,
	section: FilterSection,
	special: FilterSpecialToggle,
	sectionOptionRefs: readonly OptionRef[],
	exclusiveRefs: ToggleRef[],
): void {
	const row = content.createDiv({ cls: 'hoard-filter-panel__checkbox-row' });
	const cb = row.createEl('input', { attr: { type: 'checkbox' } });
	cb.checked = special.get();
	row.createSpan(special.spanCls ? { cls: special.spanCls, text: special.text } : { text: special.text });

	cb.addEventListener('change', () => {
		special.set(cb.checked);
		if (special.mode === 'exclusive' && cb.checked) {
			// exclusive toggles supersede the option list — reset it
			includeAllOptions([section]);
			syncOptionCheckboxes(sectionOptionRefs);
		}
	});

	if (special.mode === 'exclusive') exclusiveRefs.push({ cb, set: special.set });
	if (special.resetOnGlobal) ctx.globalResetRefs.push({ cb, set: special.set });
	if (special.dividerAfter) content.createDiv({ cls: 'hoard-filter-panel__section-divider' });
}

function renderFilterSection(ctx: PanelCtx, section: FilterSection): void {
	const { label, opts, excludeSet, formatOpt, specials } = section;
	const sectionEl = ctx.panel.createDiv({ cls: 'hoard-filter-panel__section' });

	const sectionHeader = sectionEl.createDiv({ cls: 'hoard-filter-panel__section-header' });
	sectionHeader.createSpan({ cls: 'hoard-filter-panel__label', text: label });
	const chevron = sectionHeader.createSpan({ cls: 'hoard-filter-panel__chevron', text: '▼' });

	// collapsed by default
	const content = sectionEl.createDiv({ cls: 'hoard-filter-panel__section-content hoard-hidden' });
	let collapsed = true;
	sectionHeader.addEventListener('click', (ev) => {
		ev.stopPropagation();
		collapsed = !collapsed;
		content.toggleClass('hoard-hidden', collapsed);
		chevron.textContent = collapsed ? '▼' : '▲';
	});

	const sectionOptionRefs: OptionRef[] = [];
	// "All" toggle — first item inside the section; its checkbox reflects the draft
	const syncAllCb = (): void => { allCb.checked = isSectionAllIncluded(section); };
	const allCb = renderAllToggleRow(content, () => {
		toggleSectionAll(section);
		syncOptionCheckboxes(sectionOptionRefs);
		syncAllCb();
	});

	// exclusive specials in this section — unchecked when an option is touched
	const exclusiveRefs: ToggleRef[] = [];
	for (const special of specials ?? []) renderSpecial(ctx, content, section, special, sectionOptionRefs, exclusiveRefs);

	for (const opt of opts) {
		const cbRow = content.createDiv({ cls: 'hoard-filter-panel__checkbox-row' });
		const cb = cbRow.createEl('input', { attr: { type: 'checkbox' } });
		cbRow.createSpan({ text: formatOpt ? formatOpt(opt) : opt });
		const ref: OptionRef = { cb, excludeSet, opt };
		sectionOptionRefs.push(ref);
		ctx.optionRefs.push(ref);

		cb.addEventListener('change', () => {
			if (cb.checked) excludeSet.delete(opt);
			else excludeSet.add(opt);
			// interacting with a specific option deactivates the section's exclusive toggles
			uncheckToggles(exclusiveRefs);
		});
	}
	syncOptionCheckboxes(sectionOptionRefs);
	syncAllCb();
}

/** Closes the panel on a mousedown outside it and its guard; returns the listener's remover. */
function attachOutsideCloser(ctx: PanelCtx, isClosed: () => boolean): () => void {
	const { panel, cfg } = ctx;
	const closer = (ev: MouseEvent): void => {
		// No `instanceof Node`: in a popout window the target is not an instance of this window's Node
		const target = ev.target as Node;
		if (panel.contains(target) || cfg.outsideGuard.contains(target)) return;
		ctx.closePanel();
	};
	// deferred so the click that opened the panel doesn't immediately close it
	window.setTimeout(() => {
		if (!isClosed()) activeDocument.addEventListener('mousedown', closer, false);
	}, 0);
	return () => { activeDocument.removeEventListener('mousedown', closer, false); };
}

/** Opens the panel under the anchor, or closes an already-open one (toggle). */
export function toggleFilterPanel(cfg: FilterPanelConfig): void {
	const existing = activeDocument.querySelector('.hoard-filter-panel');
	if (existing) { existing.remove(); return; }

	const panel = activeDocument.body.createDiv({ cls: 'hoard-popover hoard-filter-panel hoard-filter-panel--popup' });
	const rect = cfg.anchor.getBoundingClientRect();
	panel.setCssProps({ '--hoard-filter-panel-top': `${rect.bottom + 4}px`, '--hoard-filter-panel-left': `${rect.left}px` });

	// single teardown for every close path (Apply, outside click, preset save/delete, tab teardown);
	// `closed` makes it idempotent and guards the deferred listener attach
	let closed = false;
	let removeCloser = (): void => {};
	const ctx: PanelCtx = {
		panel,
		cfg,
		optionRefs: [],
		globalResetRefs: [],
		closePanel: () => {
			if (closed) return;
			closed = true;
			panel.remove();
			removeCloser();
		},
	};

	renderGlobalButtons(ctx);
	renderStandaloneRows(ctx);
	for (const section of cfg.sections) renderFilterSection(ctx, section);

	// Apply — commits the draft, re-renders, closes the panel
	const applyBtn = panel.createEl('button', { cls: 'hoard-btn hoard-btn--sm hoard-filter-panel__apply-btn', text: t('list.filter.apply') });
	applyBtn.addEventListener('click', (ev) => {
		ev.stopPropagation();
		cfg.onApply();
		ctx.closePanel();
	});

	removeCloser = attachOutsideCloser(ctx, () => closed);
	cfg.registerCleanup?.(ctx.closePanel);
}
