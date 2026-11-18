import { App, Notice, setIcon } from 'obsidian';
import type { SettingsReader } from '../../../shared/services/SettingsService';
import type { GameDataManager } from '../services/GameDataManager';
import { rawgResizedCover, steamAppIdFromUrl, type ApiService, type GameDetailsResult, type GameSearchResult } from '../../../shared/api/ApiService';
import type { GameCoverApi } from '../../covers/services/coverRefresh';
import { effectiveGameSource } from '../../../shared/api/apiSources';
import { newGame } from '../../../shared/domain/entryFactories';
import { GameGroup, GAME_AUTO_STATUS } from '../../../shared/domain/types';
import { renderSearchResultRow } from '../../../shared/ui/SearchThumbnail';
import { t } from '../../../shared/i18n';
import { gameStatusLabel, priorityLabel } from '../../../shared/i18n/labels';
import { SearchFormModal, type SearchPickerOptions } from '../../../shared/ui/SearchFormModal';
import { LibraryIndex, gameResultIdKeys } from '../../../shared/services/LibraryIndex';
import { renderModePill } from '../../../shared/ui/ModePill';
import { renderTagChips } from '../../../shared/ui/StatusDropdown';
import { createDatePicker } from '../../../shared/ui/DatePicker';
import { blockDuplicate, createDuplicateGuard } from '../../../shared/ui/DuplicateGuard';
import {
	linkField,
	makeCell,
	makeRow as makeFormRow,
	nameSelect,
	releaseDateField,
	renderGroupPicker,
	resetForm,
	textInput,
	titleField,
	type GroupPickerState,
} from '../../../shared/ui/FormCells';

/** Lowercased word tokens of a platform name, split into alpha and numeric. */
function platformTokens(name: string): { alpha: Set<string>; num: Set<string> } {
	const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
	return {
		alpha: new Set(tokens.filter((t) => !/^\d+$/.test(t))),
		num: new Set(tokens.filter((t) => /^\d+$/.test(t))),
	};
}

/**
 * Loose platform-name equality across APIs: the smaller alpha-token set must be contained in the
 * larger ("PC" ⊂ "Windows PC" ⊂ "PC (Microsoft Windows)"), and numeric tokens (console
 * generations) must match exactly — so "PlayStation 5" never matches "PlayStation 4".
 */
function platformMatches(a: string, b: string): boolean {
	const ta = platformTokens(a);
	const tb = platformTokens(b);
	const [small, big] = ta.alpha.size <= tb.alpha.size ? [ta.alpha, tb.alpha] : [tb.alpha, ta.alpha];
	if (small.size === 0) return false;
	for (const t of small) if (!big.has(t)) return false;
	if (ta.num.size !== tb.num.size) return false;
	for (const n of ta.num) if (!tb.num.has(n)) return false;
	return true;
}

/** "2021 · PC, PS5": release year and up to three platforms. */
function gameResultMeta(result: GameSearchResult): string {
	const year = result.releaseDate.match(/^(\d{4})/)?.[1] ?? '—';
	const platforms = result.platforms.slice(0, 3).join(', ') || t('add.game.unknownPlatforms');
	return `${year} · ${platforms}`;
}

export type AddGameApi = GameCoverApi & Pick<ApiService, 'getSteamStoreDetails'>;

export interface AddGameOptions {
	onAdded: () => void;
	/** E.g. from Drafts: seeds the search box and title field so the modal opens ready to search. */
	prefill?: { searchQuery?: string; title?: string };
}

export type OpenAddGame = (opts: AddGameOptions) => void;

/**
 * Add-game modal (the AddTitleModal pattern): search (Steam, or RAWG/IGDB once keyed) with
 * thumbnailed results, an editable form below, platform chips, the mode pill and a store-link
 * button. Steam needs no key, so search always works.
 */
export class AddGameModal extends SearchFormModal<GameSearchResult> {
	private initialQuery = '';

	private fieldTitle = '';
	private fieldDeveloper = '';
	private fieldPublisher = '';
	private fieldGenre = '';
	private fieldStatus = '';
	private fieldPriority = '';
	private fieldReleaseDate = '';
	private fieldDateStarted = '';
	private fieldStoreUrl = '';
	private fieldLink = '';
	private fieldCoverUrl = '';
	// cover last prefilled from an API result; unchanged it stays cache-only (not an override)
	private fieldPlatforms: string[] = [];
	// which API row the form was filled from — persisted on the game so covers can later be re-fetched
	// by id instead of by title
	private apiSource: '' | 'rawg' | 'igdb' | 'steam' = '';
	private apiId = '';
	// set for Steam picks, so a later Steam sync matches this game by id instead of by title
	private steamAppId = '';
	private fieldSingleplayer = false;
	private fieldCoop = false;
	private fieldMultiplayer = false;
	private group: GroupPickerState = { selectedGroupId: '', newGroupName: '' };
	private duplicates = createDuplicateGuard();
	// built on first search, reused for the modal's life
	private libIndex: LibraryIndex | null = null;

	constructor(
		app: App,
		private readonly settings: SettingsReader,
		private readonly games: GameDataManager,
		private readonly api: AddGameApi,
		private readonly opts: AddGameOptions,
	) {
		super(app, t('add.game.heading'), ['hoard-add-modal', 'hoard-add-game']);
		const { prefill } = opts;
		const s = games.getSettings();
		this.fieldGenre = s.types[0]?.name ?? '';
		this.fieldStatus = s.defaultStatus;
		// prefill (e.g. from Drafts): seed the search box and title field so the modal opens ready to search
		if (prefill?.title) this.fieldTitle = prefill.title;
		this.initialQuery = prefill?.searchQuery ?? '';
	}

	protected pickerOptions(): SearchPickerOptions<GameSearchResult> {
		return { placeholder: t('add.game.searchPlaceholder'), grid: true, initialQuery: this.initialQuery };
	}

	/** The keyless Steam source is always available, so there is never a "no API" panel. */
	protected noApiMessage(): string | null {
		return null;
	}

	protected search(query: string): Promise<GameSearchResult[]> {
		const api = this.api;
		const source = effectiveGameSource(this.settings.get(), api);
		if (source === 'igdb') return api.searchIgdbGames(query);
		if (source === 'rawg') return api.searchRawgGames(query);
		return api.searchSteamStore(query);
	}

	private fetchDetails(result: GameSearchResult): Promise<GameDetailsResult | null> {
		const api = this.api;
		if (result.source === 'igdb') return api.getIgdbGameDetails(result.id);
		if (result.source === 'steam') return api.getSteamStoreDetails(result);
		return api.getRawgGameDetails(result.id);
	}

	/** Origin of the picked game; set together with its fields so a pending pick never mixes identities. */
	private applyIdentity(result: GameSearchResult): void {
		this.apiSource = result.source;
		this.apiId = String(result.id);
		this.steamAppId = result.source === 'steam' ? this.apiId : '';
	}

	private applyDetails(result: GameSearchResult, full: GameDetailsResult): void {
		this.applyIdentity(result);
		this.fieldTitle = full.title;
		this.fieldDeveloper = full.developer;
		this.fieldPublisher = full.publisher;
		this.fieldReleaseDate = full.releaseDate;
		this.fieldCoverUrl = full.coverUrl;
		this.fieldLink = full.url;
		this.fieldStoreUrl = full.storeUrl;
		this.fieldSingleplayer = full.singleplayer;
		this.fieldCoop = full.coop;
		this.fieldMultiplayer = full.multiplayer;
		this.fieldPlatforms = this.matchOwnPlatforms(full.platforms);
	}

	protected renderResult(host: HTMLElement, result: GameSearchResult, select: (itemEl: HTMLElement) => void): HTMLElement {
		if (!this.libIndex) this.libIndex = LibraryIndex.build({ games: () => this.games.getGames() }, ['games']);
		return renderSearchResultRow(host, {
			// card covers are full-width now, so request a sharper 600px rendition
			thumbUrl: rawgResizedCover(result.coverUrl, 600),
			fallbackIcon: '🎮',
			title: result.title,
			meta: gameResultMeta(result),
			inLibrary: this.libIndex.lookup(gameResultIdKeys(result), result.title),
			onClick: select,
		});
	}

	protected async selectResult(result: GameSearchResult, isCurrent: () => boolean): Promise<void> {
		let full: GameDetailsResult | null = null;
		try {
			full = await this.fetchDetails(result);
		} catch {
			// the search row identifies the game well enough to re-fetch its cover later
		}
		if (!isCurrent()) return;
		if (full) this.applyDetails(result, full);
		else this.applySearchRow(result);
		this.renderForm();
	}

	/** Detail fetch failed or came back empty: what the search row carried, nothing from an earlier pick. */
	private applySearchRow(result: GameSearchResult): void {
		this.applyIdentity(result);
		this.fieldTitle = result.title;
		this.fieldDeveloper = '';
		this.fieldPublisher = '';
		this.fieldReleaseDate = result.releaseDate;
		this.fieldCoverUrl = result.coverUrl;
		this.fieldLink = result.url;
		this.fieldStoreUrl = '';
		this.fieldSingleplayer = false;
		this.fieldCoop = false;
		this.fieldMultiplayer = false;
		this.fieldPlatforms = this.matchOwnPlatforms(result.platforms);
	}

	/** Maps API platform names onto the user's configured platform chips. */
	private matchOwnPlatforms(apiPlatforms: string[]): string[] {
		return this.games
			.getSettings()
			.platforms.filter((own) => apiPlatforms.some((p) => platformMatches(own.name, p)))
			.map((own) => own.name);
	}

	protected renderForm(): void {
		const form = resetForm(this.formEl);
		if (!form) return;
		const makeRow = (label: string): HTMLElement => makeFormRow(form, label);

		titleField(form, this.fieldTitle, t('add.game.titlePlaceholder'), (v) => { this.fieldTitle = v; });

		const devPubRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		textInput(makeCell(devPubRow, t('add.game.developer')), {
			value: this.fieldDeveloper,
			placeholder: t('add.game.developer'),
			onInput: (v) => { this.fieldDeveloper = v; },
		});
		textInput(makeCell(devPubRow, t('add.game.publisher'), true), {
			value: this.fieldPublisher,
			placeholder: t('add.game.publisher'),
			onInput: (v) => { this.fieldPublisher = v; },
		});

		const settings = this.games.getSettings();
		const genrePriRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		nameSelect(makeCell(genrePriRow, t('add.game.genre')), settings.types.map((t) => t.name), this.fieldGenre,
			(v) => { this.fieldGenre = v; });
		nameSelect(makeCell(genrePriRow, t('add.priority'), true), this.settings.get().priorities.map((p) => p.name),
			this.fieldPriority, (v) => { this.fieldPriority = v; }, true, priorityLabel);

		// status + date started paired 50/50 (the auto "To be released" is excluded — it follows the
		// release date)
		const statusStartRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		const statuses = settings.statuses.filter((s) => s.name !== GAME_AUTO_STATUS);
		nameSelect(makeCell(statusStartRow, t('add.status')), statuses.map((s) => s.name), this.fieldStatus,
			(v) => { this.fieldStatus = v; }, false, gameStatusLabel);

		const startCell = makeCell(statusStartRow, t('add.dateStarted'), true);
		createDatePicker({
			parent: startCell,
			inputCls: 'hoard-modal__input',
			value: this.fieldDateStarted || null,
			onChange: (iso) => { this.fieldDateStarted = iso ?? ''; },
		});

		releaseDateField(form, this.fieldReleaseDate, (v) => { this.fieldReleaseDate = v; });

		const storeRow = makeRow(t('add.game.storeLink'));
		const storeInput = storeRow.createEl('input', {
			cls: 'hoard-modal__input',
			attr: { type: 'url', placeholder: 'https://store.steampowered.com/...' },
		});
		storeInput.value = this.fieldStoreUrl;
		const storeBtn = storeRow.createEl('button', {
			cls: 'hoard-store-btn',
			attr: { type: 'button', title: t('add.game.openStore'), 'aria-label': t('add.game.openStore') },
		});
		setIcon(storeBtn, 'store');
		const syncStoreBtn = (): void => {
			storeBtn.toggleClass('hoard-hidden', !this.fieldStoreUrl.trim());
		};
		syncStoreBtn();
		storeInput.addEventListener('input', () => {
			this.fieldStoreUrl = storeInput.value;
			syncStoreBtn();
		});
		storeBtn.addEventListener('click', () => {
			const url = this.fieldStoreUrl.trim();
			if (url) window.open(url, '_blank');
		});

		linkField(form, this.fieldLink, 'https://example.com', (v) => { this.fieldLink = v; });

		textInput(makeRow(t('add.coverUrl')), {
			value: this.fieldCoverUrl,
			type: 'url',
			placeholder: 'https://…',
			onInput: (v) => { this.fieldCoverUrl = v; },
		});

		const modesRow = makeRow(t('add.game.modes'));
		renderModePill(
			modesRow,
			() => ({
				singleplayer: this.fieldSingleplayer,
				coop: this.fieldCoop,
				multiplayer: this.fieldMultiplayer,
			}),
			(patch) => {
				if (patch.singleplayer !== undefined) this.fieldSingleplayer = patch.singleplayer;
				if (patch.coop !== undefined) this.fieldCoop = patch.coop;
				if (patch.multiplayer !== undefined) this.fieldMultiplayer = patch.multiplayer;
			},
		);

		// platforms — the shared coloured toggle chips, driven by Settings → Customize → Games
		const platRow = makeRow(t('add.game.platforms'));
		renderTagChips({
			wrap: platRow.createDiv({ cls: 'hoard-game-detail__platforms hoard-add-game__platforms' }),
			tags: settings.platforms,
			selected: this.fieldPlatforms,
			onToggle: (sel) => { this.fieldPlatforms = sel; },
		});

		// group fields (mutually exclusive, the AddTitleModal pattern)
		renderGroupPicker(form, this.games.getGroups(), this.group);

		const btnRow = form.createDiv({ cls: 'hoard-modal__btn-row' });
		const addBtn = btnRow.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('add.game.submit') });
		addBtn.addEventListener('click', () => void this.addGame());
	}

	private async addGame(): Promise<void> {
		const titleName = this.fieldTitle.trim();
		if (!titleName) {
			new Notice(t('add.game.emptyTitle'));
			return;
		}

		const isDuplicate = this.games.getGames().some(
			(g) => g.title.toLowerCase() === titleName.toLowerCase(),
		);
		const blocked = blockDuplicate(this.contentEl, this.duplicates, {
			name: titleName,
			isDuplicate,
			verb: 'Add',
			retry: () => void this.addGame(),
		});
		if (blocked) return;

		const game = newGame({
			id: this.games.generateGameId(titleName),
			title: titleName,
			developer: this.fieldDeveloper.trim(),
			publisher: this.fieldPublisher.trim(),
			type: this.fieldGenre,
			status: this.fieldStatus,
			priority: this.fieldPriority,
			platforms: [...this.fieldPlatforms],
			singleplayer: this.fieldSingleplayer,
			coop: this.fieldCoop,
			multiplayer: this.fieldMultiplayer,
			coverUrl: this.fieldCoverUrl.trim(),
			apiSource: this.apiSource,
			apiId: this.apiId,
			// seeded from the store link when it's a Steam page, so a later Steam sync matches exactly instead
			// of guessing by title
			steamAppId: this.steamAppId || steamAppIdFromUrl(this.fieldStoreUrl.trim()),
			storeUrl: this.fieldStoreUrl.trim(),
			externalLink: this.fieldLink.trim(),
			releaseDate: this.fieldReleaseDate || null,
			dateStarted: this.fieldDateStarted || null,
		});

		await this.games.addGame(game);

		if (this.group.selectedGroupId) {
			await this.games.addGameToGroup(this.group.selectedGroupId, game.id);
		} else if (this.group.newGroupName.trim()) {
			const name = this.group.newGroupName.trim();
			const group: GameGroup = {
				id: this.games.generateGroupId(name),
				name,
				gameIds: [game.id],
				dateAdded: new Date().toISOString(),
			};
			await this.games.addGroup(group);
		}

		new Notice(t('add.added', { name: titleName }));
		this.close();
		this.opts.onAdded();
	}
}
