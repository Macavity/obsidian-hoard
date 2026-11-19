import { App, Modal } from 'obsidian';
import type { SettingsReader } from '../../settings/contract';
import type { MediaSearchResult } from '../contract';
import { apiErrorMessage, type ApiService } from '../../../shared/api/ApiService';
import type { OpenAddTitle } from './AddTitleModal';
import { t } from '../../../shared/i18n';
import { effectiveMediaSource } from '../../../shared/api/apiSources';

/** themoviedb.org/movie/27205-inception, /tv/1396, with or without slug and query */
const TMDB_URL_RE = /themoviedb\.org\/(movie|tv)\/(\d+)/i;

/** The lookups a pasted IMDb or TMDB link resolves through. */
export type AddFromUrlApi = Pick<
	ApiService,
	| 'getTmdbByImdbId' | 'getOmdbByImdbId' | 'hasTmdbKey' | 'hasOmdbKey' | 'getCinemetaDetails'
	| 'getTmdbMovieDetails' | 'getTmdbTvDetails'
>;

export interface AddFromUrlOptions {
	/** Runs after the looked-up title was added through the manual form. */
	onAdded: () => void;
}

export type OpenAddFromUrl = (opts: AddFromUrlOptions) => void;

export class AddFromUrlModal extends Modal {
	private imdbInput: HTMLInputElement | null = null;
	private tmdbInput: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly settings: SettingsReader,
		private readonly api: AddFromUrlApi,
		private readonly openAddTitle: OpenAddTitle,
		private readonly opts: AddFromUrlOptions,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(t('add.choice.fromUrl'));
		const content = this.contentEl;
		content.addClass('hoard-add-modal');

		content.createDiv({
			cls: 'hoard-modal__info',
			text: t('add.url.info'),
		});

		this.imdbInput = this.buildRow(
			content,
			'IMDb',
			'https://www.imdb.com/title/ttXXXXXXX/',
			() => this.lookupImdb(),
		);
		this.tmdbInput = this.buildRow(
			content,
			'TMDB',
			'https://www.themoviedb.org/movie/XXXXX',
			() => this.lookupTmdb(),
		);

		this.errorEl = content.createDiv({ cls: 'hoard-modal__error' });
		this.errorEl.hide();

		window.setTimeout(() => this.imdbInput?.focus(), 50);
	}

	/** label · url input · inline Add button; the button owns its own loading state */
	private buildRow(
		content: HTMLElement,
		label: string,
		placeholder: string,
		lookup: () => Promise<MediaSearchResult | null | 'invalid' | 'nokey'>,
	): HTMLInputElement {
		const row = content.createDiv({ cls: 'hoard-modal__row' });
		row.createDiv({ cls: 'hoard-modal__label hoard-modal__url-row-label', text: label });
		const input = row.createEl('input', {
			cls: 'hoard-modal__input',
			attr: { type: 'url', placeholder },
		});
		const btn = row.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('common.add') });

		const run = () => void this.handleAdd(btn, lookup);
		btn.addEventListener('click', run);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') run();
		});
		return input;
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async lookupImdb(): Promise<MediaSearchResult | null | 'invalid'> {
		const match = (this.imdbInput?.value.trim() ?? '').match(/tt\d+/);
		if (!match) return 'invalid';
		const api = this.api;
		const source = effectiveMediaSource(this.settings.get(), api);
		if (source === 'tmdb') return api.getTmdbByImdbId(match[0]);
		if (source === 'omdb') return api.getOmdbByImdbId(match[0]);
		// Cinemeta is keyed by kind, and an IMDb link doesn't say which: series first, then movie (the movie endpoint answers series ids with a foreign film)
		return (await api.getCinemetaDetails(match[0], 'tv')) ?? (await api.getCinemetaDetails(match[0], 'movie'));
	}

	/** TMDB links carry the id + media type outright, so the detail call is direct — but it needs a key */
	private async lookupTmdb(): Promise<MediaSearchResult | null | 'invalid' | 'nokey'> {
		const match = (this.tmdbInput?.value.trim() ?? '').match(TMDB_URL_RE);
		if (!match) return 'invalid';
		if (!this.api.hasTmdbKey()) return 'nokey';
		const [, kind, id] = match;
		return kind!.toLowerCase() === 'movie'
			? this.api.getTmdbMovieDetails(id!)
			: this.api.getTmdbTvDetails(id!);
	}

	private async handleAdd(
		btn: HTMLButtonElement,
		lookup: () => Promise<MediaSearchResult | null | 'invalid' | 'nokey'>,
	): Promise<void> {
		btn.disabled = true;
		btn.textContent = t('common.loading');
		if (this.errorEl) this.errorEl.hide();

		try {
			let result: MediaSearchResult | null | 'invalid' | 'nokey';
			try {
				result = await lookup();
			} catch (err) {
				// a rejected key reaches here instead of resolving null — it must not read as "not found"
				this.showError(apiErrorMessage(err));
				return;
			}

			if (result === 'nokey') {
				this.showError(t('add.url.noTmdbKey'));
				return;
			}
			if (result === 'invalid' || !result) {
				this.showError(t('add.url.notFound'));
				return;
			}

			this.close();

			const type = result.mediaType === 'movie' ? 'Movie' : 'TV Show';
			this.openAddTitle({
				onAdded: this.opts.onAdded,
				prefill: {
					title: result.title,
					type,
					episodes: result.episodes,
					duration: result.episodeDuration,
					releaseDate: result.releaseDate,
					link: result.url,
					seasons: result.seasons,
					trailerUrl: result.trailerUrl ?? '',
					director: result.director,
					cast: result.cast,
				},
			});
		} finally {
			btn.disabled = false;
			btn.textContent = t('common.add');
		}
	}

	private showError(msg: string): void {
		if (this.errorEl) {
			this.errorEl.textContent = msg;
			this.errorEl.show();
		}
	}
}
