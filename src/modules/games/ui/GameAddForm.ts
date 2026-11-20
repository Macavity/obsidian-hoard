import { Notice, setIcon } from 'obsidian';
import type { GameDataManager } from '../services/GameDataManager';
import { steamAppIdFromUrl, type ApiService, type GameDetailsResult, type GameSearchResult } from '../../../shared/api/ApiService';
import type { GameCoverApi } from '../../../shared/services/coverRefresh';
import type { SettingsReader } from '../../settings/exports';
import type { AddFormContext, AddFormHandle } from '../../add/exports';
import { newGame } from '../domain/newGame';
import type { GameGroup } from '../domain/model';
import { GAME_AUTO_STATUS } from '../domain/gameDefaults';
import { platformMatches } from '../domain/platformMatch';
import { t } from '../../../shared/i18n';
import { gameStatusLabel, priorityLabel } from '../../../shared/i18n/labels';
import { renderModePill } from './ModePill';
import { renderTagChips } from '../../../design-system/StatusDropdown';
import { createDatePicker } from '../../../design-system/DatePicker';
import { blockDuplicate, createDuplicateGuard } from '../../../design-system/DuplicateGuard';
import {
	linkField,
	makeCell,
	makeRow,
	nameSelect,
	releaseDateField,
	renderGroupPicker,
	textInput,
	titleField,
	type GroupPickerState,
} from '../../../design-system/FormCells';

export type AddGameApi = GameCoverApi & Pick<ApiService, 'getSteamStoreDetails'>;

export type AddGameStore = Pick<
	GameDataManager,
	'getGames' | 'getGroups' | 'getSettings' | 'generateGameId' | 'addGame' | 'addGameToGroup' | 'addGroup' | 'generateGroupId'
>;

class GameAddForm implements AddFormHandle {
	private title = '';
	private developer = '';
	private publisher = '';
	private genre: string;
	private status: string;
	private priority = '';
	private releaseDate = '';
	private dateStarted = '';
	private storeUrl = '';
	private link = '';
	private coverUrl = '';
	private platforms: string[] = [];
	// which API row the form was filled from: persisted so covers can later be re-fetched by id instead of by title
	private apiSource: '' | 'rawg' | 'igdb' | 'steam' = '';
	private apiId = '';
	// set for Steam picks, so a later Steam sync matches this game by id instead of by title
	private steamAppId = '';
	private singleplayer = false;
	private coop = false;
	private multiplayer = false;
	private readonly group: GroupPickerState = { selectedGroupId: '', newGroupName: '' };
	private readonly duplicates = createDuplicateGuard();
	private destroyed = false;

	constructor(
		private readonly host: HTMLElement,
		private readonly settings: SettingsReader,
		private readonly games: AddGameStore,
		private readonly api: AddGameApi,
		private readonly ctx: AddFormContext,
		private readonly row: GameSearchResult | null,
	) {
		const own = games.getSettings();
		this.genre = own.types[0]?.name ?? '';
		this.status = own.defaultStatus;
	}

	start(): void {
		if (!this.row) {
			this.title = this.ctx.query;
			this.render();
			return;
		}
		this.host.createDiv({ cls: 'hoard-modal__loading', text: t('common.loading') });
		void this.fetchDetails(this.row).then((full) => {
			if (this.destroyed || !this.row) return;
			if (full) this.applyDetails(this.row, full);
			else this.applySearchRow(this.row);
			this.render();
		});
	}

	destroy(): void {
		this.destroyed = true;
		this.host.empty();
	}

	private async fetchDetails(result: GameSearchResult): Promise<GameDetailsResult | null> {
		try {
			if (result.source === 'igdb') return await this.api.getIgdbGameDetails(result.id);
			if (result.source === 'steam') return await this.api.getSteamStoreDetails(result);
			return await this.api.getRawgGameDetails(result.id);
		} catch {
			// the search row identifies the game well enough to re-fetch its cover later
			return null;
		}
	}

	/** Origin of the picked game; set together with its fields so a pick never mixes identities. */
	private applyIdentity(result: GameSearchResult): void {
		this.apiSource = result.source;
		this.apiId = String(result.id);
		this.steamAppId = result.source === 'steam' ? this.apiId : '';
	}

	private applyDetails(result: GameSearchResult, full: GameDetailsResult): void {
		this.applyIdentity(result);
		this.title = full.title;
		this.developer = full.developer;
		this.publisher = full.publisher;
		this.releaseDate = full.releaseDate;
		this.coverUrl = full.coverUrl;
		this.link = full.url;
		this.storeUrl = full.storeUrl;
		this.singleplayer = full.singleplayer;
		this.coop = full.coop;
		this.multiplayer = full.multiplayer;
		this.platforms = this.matchOwnPlatforms(full.platforms);
	}

	/** The detail fetch failed or came back empty: what the search row carried. */
	private applySearchRow(result: GameSearchResult): void {
		this.applyIdentity(result);
		this.title = result.title;
		this.releaseDate = result.releaseDate;
		this.coverUrl = result.coverUrl;
		this.link = result.url;
		this.platforms = this.matchOwnPlatforms(result.platforms);
	}

	/** Maps API platform names onto the user's configured platform chips. */
	private matchOwnPlatforms(apiPlatforms: string[]): string[] {
		return this.games
			.getSettings()
			.platforms.filter((own) => apiPlatforms.some((p) => platformMatches(own.name, p)))
			.map((own) => own.name);
	}

	private render(): void {
		this.host.empty();
		const form = this.host.createDiv({ cls: 'hoard-modal__form' });
		const own = this.games.getSettings();

		titleField(form, this.title, t('add.game.titlePlaceholder'), (v) => { this.title = v; });

		const devPubRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		textInput(makeCell(devPubRow, t('add.game.developer')), {
			value: this.developer,
			placeholder: t('add.game.developer'),
			onInput: (v) => { this.developer = v; },
		});
		textInput(makeCell(devPubRow, t('add.game.publisher'), true), {
			value: this.publisher,
			placeholder: t('add.game.publisher'),
			onInput: (v) => { this.publisher = v; },
		});

		const genrePriRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		nameSelect(makeCell(genrePriRow, t('add.game.genre')), own.types.map((ty) => ty.name), this.genre,
			(v) => { this.genre = v; });
		nameSelect(makeCell(genrePriRow, t('add.priority'), true), this.settings.get().priorities.map((p) => p.name),
			this.priority, (v) => { this.priority = v; }, true, priorityLabel);

		// the auto "To be released" status follows the release date, so it is not offered
		const statusStartRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		const statuses = own.statuses.filter((s) => s.name !== GAME_AUTO_STATUS);
		nameSelect(makeCell(statusStartRow, t('add.status')), statuses.map((s) => s.name), this.status,
			(v) => { this.status = v; }, false, gameStatusLabel);
		createDatePicker({
			parent: makeCell(statusStartRow, t('add.dateStarted'), true),
			inputCls: 'hoard-modal__input',
			value: this.dateStarted || null,
			onChange: (iso) => { this.dateStarted = iso ?? ''; },
		});

		releaseDateField(form, this.releaseDate, (v) => { this.releaseDate = v; });
		this.renderStoreLink(form);
		linkField(form, this.link, 'https://example.com', (v) => { this.link = v; });
		textInput(makeRow(form, t('add.coverUrl')), {
			value: this.coverUrl,
			type: 'url',
			placeholder: 'https://…',
			onInput: (v) => { this.coverUrl = v; },
		});

		renderModePill(
			makeRow(form, t('add.game.modes')),
			() => ({ singleplayer: this.singleplayer, coop: this.coop, multiplayer: this.multiplayer }),
			(patch) => {
				if (patch.singleplayer !== undefined) this.singleplayer = patch.singleplayer;
				if (patch.coop !== undefined) this.coop = patch.coop;
				if (patch.multiplayer !== undefined) this.multiplayer = patch.multiplayer;
			},
		);

		renderTagChips({
			wrap: makeRow(form, t('add.game.platforms')).createDiv({ cls: 'hoard-game-detail__platforms' }),
			tags: own.platforms,
			selected: this.platforms,
			onToggle: (sel) => { this.platforms = sel; },
		});

		renderGroupPicker(form, this.games.getGroups(), this.group);

		const btnRow = form.createDiv({ cls: 'hoard-modal__btn-row' });
		const submit = btnRow.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('add.game.submit') });
		submit.addEventListener('click', () => void this.save());
	}

	private renderStoreLink(form: HTMLElement): void {
		const storeRow = makeRow(form, t('add.game.storeLink'));
		const storeInput = storeRow.createEl('input', {
			cls: 'hoard-modal__input',
			attr: { type: 'url', placeholder: 'https://store.steampowered.com/...' },
		});
		storeInput.value = this.storeUrl;
		const storeBtn = storeRow.createEl('button', {
			cls: 'hoard-store-btn',
			attr: { type: 'button', title: t('add.game.openStore'), 'aria-label': t('add.game.openStore') },
		});
		setIcon(storeBtn, 'store');
		const syncStoreBtn = (): void => {
			storeBtn.toggleClass('hoard-hidden', !this.storeUrl.trim());
		};
		syncStoreBtn();
		storeInput.addEventListener('input', () => {
			this.storeUrl = storeInput.value;
			syncStoreBtn();
		});
		storeBtn.addEventListener('click', () => {
			const url = this.storeUrl.trim();
			if (url) window.open(url, '_blank');
		});
	}

	private async save(): Promise<void> {
		const name = this.title.trim();
		if (!name) {
			new Notice(t('add.game.emptyTitle'));
			return;
		}
		const blocked = blockDuplicate(this.host, this.duplicates, {
			name,
			isDuplicate: this.games.getGames().some((g) => g.title.toLowerCase() === name.toLowerCase()),
			verb: 'Add',
			retry: () => void this.save(),
		});
		if (blocked) return;

		const game = newGame({
			id: this.games.generateGameId(name),
			title: name,
			developer: this.developer.trim(),
			publisher: this.publisher.trim(),
			type: this.genre,
			status: this.status,
			priority: this.priority,
			platforms: [...this.platforms],
			singleplayer: this.singleplayer,
			coop: this.coop,
			multiplayer: this.multiplayer,
			coverUrl: this.coverUrl.trim(),
			apiSource: this.apiSource,
			apiId: this.apiId,
			// seeded from the store link when it is a Steam page, so a later Steam sync matches exactly instead of by title
			steamAppId: this.steamAppId || steamAppIdFromUrl(this.storeUrl.trim()),
			storeUrl: this.storeUrl.trim(),
			externalLink: this.link.trim(),
			releaseDate: this.releaseDate || null,
			dateStarted: this.dateStarted || null,
		});
		await this.games.addGame(game);
		await this.addToGroup(game.id);
		new Notice(t('add.added', { name }));
		this.ctx.done({ kind: 'game', id: game.id });
	}

	private async addToGroup(gameId: string): Promise<void> {
		if (this.group.selectedGroupId) {
			await this.games.addGameToGroup(this.group.selectedGroupId, gameId);
			return;
		}
		const name = this.group.newGroupName.trim();
		if (!name) return;
		const group: GameGroup = { id: this.games.generateGroupId(name), name, gameIds: [gameId], dateAdded: new Date().toISOString() };
		await this.games.addGroup(group);
	}
}

/**
 * Mounts the form that saves a game into `host`. `row` is the picked search row, whose details
 * are fetched first; null is a manual entry with the typed query as its title.
 */
export function mountGameAddForm(
	host: HTMLElement,
	settings: SettingsReader,
	games: AddGameStore,
	api: AddGameApi,
	ctx: AddFormContext,
	row: GameSearchResult | null,
): AddFormHandle {
	const form = new GameAddForm(host, settings, games, api, ctx, row);
	form.start();
	return form;
}
