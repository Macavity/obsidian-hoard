import { t } from '../shared/i18n';

/** One section of the result list; `key` identifies it, `label` is its header text. */
export interface ResultSectionSpec {
	key: string;
	label: string;
}

export interface SectionedResultsConfig<T> {
	/** Renders one item into `host`; call `select(itemEl)` when the user picks it. */
	renderItem(host: HTMLElement, item: T, select: (itemEl: HTMLElement) => void): HTMLElement;
	onSelect(sectionKey: string, item: T): void;
}

export interface SectionedResults<T> {
	mount(parent: HTMLElement): void;
	/** Order is the display order; resets every section (hidden until it gets a state). */
	setSections(sections: readonly ResultSectionSpec[]): void;
	setLoading(key: string): void;
	/** An empty list hides the section. */
	setResults(key: string, items: readonly T[]): void;
	setError(key: string, message: string): void;
	destroy(): void;
}

interface SectionView {
	el: HTMLElement;
	items: HTMLElement;
}

/**
 * Search hits grouped into collapsible sections that load and fail independently. Knows nothing
 * about what a section stands for; the caller names the sections and renders the items.
 */
export function createSectionedResults<T>(config: SectionedResultsConfig<T>): SectionedResults<T> {
	let root: HTMLElement | null = null;
	let specs: readonly ResultSectionSpec[] = [];
	const views = new Map<string, SectionView>();

	function buildSection(parent: HTMLElement, spec: ResultSectionSpec): void {
		const el = parent.createDiv({
			cls: 'hoard-result-sections__section',
			attr: { 'data-section': spec.key },
		});
		const header = el.createDiv({ cls: 'hoard-result-sections__header' });
		header.createSpan({ cls: 'hoard-result-sections__chevron', text: '▾' });
		header.createSpan({ cls: 'hoard-result-sections__label', text: spec.label });
		let collapsed = false;
		header.addEventListener('click', () => {
			collapsed = !collapsed;
			el.toggleClass('is-collapsed', collapsed);
		});
		const items = el.createDiv({ cls: 'hoard-result-sections__items hoard-modal__results hoard-search-picker__results-grid' });
		el.hide();
		views.set(spec.key, { el, items });
	}

	function build(): void {
		views.clear();
		if (!root) return;
		root.empty();
		for (const spec of specs) buildSection(root, spec);
	}

	function clearSelection(): void {
		for (const { items } of views.values()) {
			for (const child of Array.from(items.children)) child.removeClass('is-selected');
		}
	}

	function select(key: string, item: T, itemEl: HTMLElement): void {
		clearSelection();
		itemEl.addClass('is-selected');
		config.onSelect(key, item);
	}

	function message(key: string, icon: string, text: string, cls: string): void {
		const view = views.get(key);
		if (!view) return;
		view.items.empty();
		const msg = view.items.createDiv({ cls });
		msg.createSpan({ cls: 'hoard-search-picker__missing-api-icon', text: icon });
		msg.createSpan({ cls: 'hoard-search-picker__missing-api-text', text });
		view.el.show();
	}

	return {
		mount(parent) {
			root = parent.createDiv({ cls: 'hoard-result-sections' });
			build();
		},
		setSections(sections) {
			specs = sections;
			build();
		},
		setLoading(key) {
			const view = views.get(key);
			if (!view) return;
			view.items.empty();
			view.items.createDiv({ cls: 'hoard-modal__loading', text: t('ui.picker.searching') });
			view.el.show();
		},
		setResults(key, items) {
			const view = views.get(key);
			if (!view) return;
			view.items.empty();
			if (items.length === 0) {
				view.el.hide();
				return;
			}
			for (const item of items) {
				config.renderItem(view.items, item, (itemEl) => { select(key, item, itemEl); });
			}
			view.el.show();
		},
		setError(key, text) {
			message(key, '⚠', text, 'hoard-search-picker__missing-api hoard-search-picker__api-error');
		},
		destroy() {
			root?.remove();
			root = null;
			views.clear();
			specs = [];
		},
	};
}
