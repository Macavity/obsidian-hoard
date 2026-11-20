import { Modal, type App } from 'obsidian';
import { createSectionedResults, type SectionedResults } from '../../../design-system/SectionedResults';
import { renderSearchResultRow } from '../../../design-system/SearchThumbnail';
import { apiErrorMessage } from '../../../shared/api/ApiService';
import { t, type TranslationKey } from '../../../shared/i18n';
import type {
	AddFormHandle, AddHit, AddKind, AddProvider, AddTarget, AddWizardOptions,
} from '../domain/provider';
import { orderKinds } from '../domain/sectionOrder';

const DEBOUNCE_MS = 600;

const kindLabelOne = (kind: AddKind): string => t(`add.wizard.kindOne.${kind}` satisfies TranslationKey);
const kindLabel = (kind: AddKind): string => t(`add.wizard.kind.${kind}` satisfies TranslationKey);

/**
 * The central add dialog. Step 1 searches every kind at once into sections and offers a manual
 * entry per kind; step 2 hands the chosen hit (or a blank entry) to the owning provider's form.
 */
export class AddWizardModal extends Modal {
	private readonly target: AddTarget;
	private readonly kinds: readonly AddKind[];
	private readonly owners = new Map<AddKind, AddProvider>();
	private results: SectionedResults<AddHit> | null = null;
	private searchEl: HTMLElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private stepEl: HTMLElement | null = null;
	private form: AddFormHandle | null = null;
	private query = '';
	/** Bumped by every query and by close; a response only counts while its number is current. */
	private generation = 0;
	private debounce: number | null = null;

	constructor(app: App, private readonly providers: readonly AddProvider[], private readonly opts: AddWizardOptions) {
		super(app);
		this.target = opts.target ?? 'library';
		for (const provider of providers) {
			for (const kind of this.kindsOf(provider)) {
				if (!this.owners.has(kind)) this.owners.set(kind, provider);
			}
		}
		this.kinds = orderKinds([...this.owners.keys()], opts.preferredKinds);
	}

	onOpen(): void {
		this.setTitle(t('add.wizard.title'));
		this.contentEl.addClass('hoard-add-wizard');
		const search = this.contentEl.createDiv({ cls: 'hoard-add-wizard__search' });
		this.searchEl = search;
		this.mountQueryInput(search);
		const results = createSectionedResults<AddHit>({
			renderItem: (host, hit, select) => renderSearchResultRow(host, {
				thumbUrl: hit.thumbUrl,
				fallbackIcon: hit.fallbackIcon,
				title: hit.title,
				meta: hit.meta,
				inLibrary: hit.inLibrary,
				onClick: select,
			}),
			onSelect: (key, hit) => { this.openForm(key as AddKind, hit); },
		});
		results.mount(search);
		this.results = results;
		this.resetSections();
		this.mountManualRow(search);
		if (this.opts.query) this.runQuery(this.opts.query);
	}

	onClose(): void {
		this.generation++;
		this.clearDebounce();
		this.form?.destroy();
		this.form = null;
		this.results?.destroy();
		this.results = null;
		this.searchEl = null;
		this.inputEl = null;
		this.stepEl = null;
		this.contentEl.empty();
	}

	private kindsOf(provider: AddProvider): readonly AddKind[] {
		return this.target === 'maybe' ? (provider.maybeKinds ?? []) : provider.kinds;
	}

	private mountQueryInput(parent: HTMLElement): void {
		const input = parent.createEl('input', {
			cls: 'hoard-modal__input hoard-add-wizard__query',
			attr: { type: 'text', placeholder: t('add.wizard.placeholder') },
		});
		this.inputEl = input;
		input.value = this.opts.query ?? '';
		input.addEventListener('input', () => {
			this.clearDebounce();
			this.debounce = window.setTimeout(() => { this.runQuery(input.value); }, DEBOUNCE_MS);
		});
		input.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			this.clearDebounce();
			this.runQuery(input.value);
		});
		input.focus();
	}

	private mountManualRow(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'hoard-add-wizard__manual' });
		for (const kind of this.kinds) {
			const btn = row.createEl('button', { cls: 'hoard-btn', text: t('add.wizard.manualAs', { kind: kindLabelOne(kind) }) });
			btn.addEventListener('click', () => { this.openForm(kind, null); });
		}
	}

	private resetSections(): void {
		this.results?.setSections(this.kinds.map((key) => ({ key, label: kindLabel(key) })));
	}

	private clearDebounce(): void {
		if (this.debounce !== null) window.clearTimeout(this.debounce);
		this.debounce = null;
	}

	private runQuery(raw: string): void {
		const results = this.results;
		if (!results) return;
		this.query = raw.trim();
		const gen = ++this.generation;
		if (!this.query) {
			this.resetSections();
			return;
		}
		const resolvers = this.providers.filter((p) => p.resolveUrl !== undefined && this.kindsOf(p).some((k) => this.kinds.includes(k)));
		if (resolvers.length === 0) {
			this.search(gen, this.query);
			return;
		}
		for (const kind of this.kinds) results.setLoading(kind);
		void this.resolveThenSearch(gen, this.query, resolvers);
	}

	private async resolveThenSearch(gen: number, query: string, resolvers: readonly AddProvider[]): Promise<void> {
		const found = await Promise.all(resolvers.map(async (provider) => {
			try {
				const hit = await provider.resolveUrl?.(query);
				return hit ? { provider, hit } : null;
			} catch {
				return null;
			}
		}));
		if (gen !== this.generation) return;
		const match = found.find((f) => f !== null && this.kinds.includes(f.hit.kind));
		if (match) {
			// the sections still show "searching"; reset them so Back lands on a clean step 1
			this.resetSections();
			this.openFormWith(match.provider, match.hit.kind, match.hit);
			return;
		}
		this.search(gen, query);
	}

	private search(gen: number, query: string): void {
		for (const kind of this.kinds) {
			const provider = this.owners.get(kind);
			if (!provider) continue;
			this.results?.setLoading(kind);
			// an async wrapper turns a synchronous throw into a rejection of this kind only
			void (async () => provider.search(kind, query))().then(
				(hits) => { if (gen === this.generation) this.results?.setResults(kind, hits); },
				(err: unknown) => { if (gen === this.generation) this.results?.setError(kind, apiErrorMessage(err)); },
			);
		}
	}

	private openForm(kind: AddKind, hit: AddHit | null): void {
		const provider = this.owners.get(kind);
		if (provider) this.openFormWith(provider, kind, hit);
	}

	private openFormWith(provider: AddProvider, kind: AddKind, hit: AddHit | null): void {
		if (this.form || !this.searchEl) return;
		this.clearDebounce();
		this.searchEl.hide();
		const step = this.contentEl.createDiv({ cls: 'hoard-add-wizard__step' });
		this.stepEl = step;
		const back = step.createEl('button', { cls: 'hoard-btn hoard-add-wizard__back', text: t('add.wizard.back') });
		back.addEventListener('click', () => { this.closeForm(); });
		const host = step.createDiv({ cls: 'hoard-add-wizard__form' });
		this.form = provider.renderForm(host, {
			kind,
			hit,
			query: this.inputEl?.value.trim() ?? this.query,
			target: this.target,
			back: () => { this.closeForm(); },
			done: (result) => {
				this.close();
				this.opts.onAdded?.(result);
			},
		});
	}

	private closeForm(): void {
		this.form?.destroy();
		this.form = null;
		this.stepEl?.remove();
		this.stepEl = null;
		this.searchEl?.show();
	}
}
