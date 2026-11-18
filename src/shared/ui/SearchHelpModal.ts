import { App, Modal } from 'obsidian';
import { createIconButton } from './ui/IconButton';
import { t, type TranslationKey } from './i18n';
import type { SearchFieldSpec } from './SearchQuery';

/** A query rendered as coloured parts: v = value, f = field prefix, o = operator. */
type Part = [kind: 'v' | 'f' | 'o' | 'p', text: string];

/** Span class per part kind; spelled out so every class name appears literally. */
const PART_CLASSES: Record<Part[0], string> = {
	v: 'hoard-search-help__query-value',
	f: 'hoard-search-help__query-field',
	o: 'hoard-search-help__query-operator',
	p: 'hoard-search-help__query-punctuation',
};

interface HelpExample {
	parts: Part[];
	says: TranslationKey;
}

// deliberately abstract — colour words, never real titles or people
const EXAMPLES: HelpExample[] = [
	{
		parts: [['v', 'red'], ['p', ' '], ['v', 'blue']],
		says: 'misc.searchHelp.exampleBoth',
	},
	{
		parts: [['o', '"'], ['v', 'red blue'], ['o', '"']],
		says: 'misc.searchHelp.examplePhrase',
	},
	{
		parts: [['f', 'director:'], ['v', 'red']],
		says: 'misc.searchHelp.exampleOneField',
	},
	{
		parts: [['v', 'red'], ['p', ' '], ['o', '|'], ['p', ' '], ['v', 'blue']],
		says: 'misc.searchHelp.exampleEither',
	},
	{
		parts: [['v', 'red'], ['p', ' '], ['o', '-'], ['v', 'blue']],
		says: 'misc.searchHelp.exampleMinus',
	},
	{
		parts: [['f', 'year:'], ['o', '>'], ['v', '2020']],
		says: 'misc.searchHelp.exampleRange',
	},
	{
		parts: [['f', 'cast:'], ['v', 'red'], ['p', ' '], ['f', 'studio:'], ['v', 'blue'], ['p', ' '], ['f', 'rating:'], ['o', '>='], ['v', '4']],
		says: 'misc.searchHelp.exampleMix',
	},
];

/**
 * The "?" panel next to each search box. Lists the syntax plus the fields the *current* tab
 * searches, since those differ (Games has platforms, Reading has your custom columns).
 */
class SearchHelpModal<T> extends Modal {
	constructor(
		app: App,
		private tabLabel: string,
		private fields: SearchFieldSpec<T>[],
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('hoard-search-help');
		this.titleEl.setText(t('misc.searchHelp.title'));

		contentEl.createDiv({
			cls: 'hoard-search-help__intro',
			text: t('misc.searchHelp.intro'),
		});

		const list = contentEl.createDiv({ cls: 'hoard-search-help__list' });
		for (const ex of EXAMPLES) {
			const row = list.createDiv({ cls: 'hoard-search-help__row' });
			const q = row.createDiv({ cls: 'hoard-search-help__query' });
			for (const [kind, text] of ex.parts) {
				q.createSpan({ cls: PART_CLASSES[kind], text });
			}
			row.createDiv({ cls: 'hoard-search-help__says', text: t(ex.says) });
		}

		const textFields = this.fields.filter((f) => f.text);
		const numFields = this.fields.filter((f) => f.number);

		const fieldsWrap = contentEl.createDiv({ cls: 'hoard-search-help__fields' });

		fieldsWrap.createDiv({ cls: 'hoard-search-help__fields-title', text: t('misc.searchHelp.tabSearches', { tab: this.tabLabel }) });
		const textRow = fieldsWrap.createDiv({ cls: 'hoard-search-help__chips' });
		for (const f of textFields) {
			textRow.createSpan({ cls: 'hoard-search-help__chip hoard-search-help__query-field', text: f.name });
		}
		if (textFields.length === 0) textRow.createSpan({ cls: 'hoard-search-help__chip', text: '—' });

		if (numFields.length > 0) {
			fieldsWrap.createDiv({ cls: 'hoard-search-help__fields-title', text: t('misc.searchHelp.numberRanges') });
			const numRow = fieldsWrap.createDiv({ cls: 'hoard-search-help__chips' });
			for (const f of numFields) {
				numRow.createSpan({ cls: 'hoard-search-help__chip hoard-search-help__query-operator', text: `${f.name}:` });
			}
		}

		contentEl.createDiv({
			cls: 'hoard-search-help__note',
			text: t('misc.searchHelp.note'),
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Adds the "?" button to a search wrapper. One call per tab, so the three search bars keep their own
 * debounce and rerender wiring.
 */
export function renderSearchHelpButton<T>(
	wrap: HTMLElement,
	app: App,
	tabLabel: string,
	fields: () => SearchFieldSpec<T>[],
): HTMLElement {
	const btn = createIconButton(wrap, {
		icon: 'help-circle',
		label: t('misc.searchHelp.title'),
		cls: 'hoard-search-help__btn',
	});
	btn.addEventListener('click', () => {
		new SearchHelpModal(app, tabLabel, fields()).open();
	});
	return btn;
}
