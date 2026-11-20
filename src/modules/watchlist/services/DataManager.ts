import { TFile, stringifyYaml } from 'obsidian';
import type { TAbstractFile } from 'obsidian';
import type { ApiService } from '../../../shared/api/ApiService';
import type { EntryNotes } from '../../../shared/services/EntryNotes';
import type { SettingsReader } from '../../settings/exports';
import { toEntryAirtime } from '../../airtime/exports';
import type { AirtimeEntry, AirtimeSchedule, EntryAirtime } from '../../airtime/exports';
import type { DraftPersistState, DraftStore } from '../../drafts/exports';
import type { AirtimeStore } from '../../airtime/exports';
import type { Game } from '../../games/exports';
import type { Book, Manga } from '../../reading/exports';
import type { HoardGroup, HoardTitle, MaybeTitle, SavedFilterPreset, Season } from '../domain/model';
import type { TitleBackup, TitleMaintenance, TitleReader, TitleStats, TitleWriter } from './roles';
import type { RecommendedDaily } from '../../../shared/domain/rows';
import type { HistoryManager } from '../../../shared/services/HistoryManager';
import { formatHistoryDate } from '../../../shared/services/HistoryManager';
import { normalizeManualCredits, pruneManualCredits } from '../domain/titleHelpers';
import { isReleaseDateFuture, todayIso } from '../../../shared/domain/date';
import { GAME_AUTO_STATUS } from '../../games/exports';
import type { CreditsField } from '../domain/model';
import { newTitle } from '../domain/newTitle';
import type { AnyEntry, EntryIndex } from '../../../shared/storage/EntryIndex';
import { getBaseline, sameStoredState, setBaseline, getNotesBaseline, setNotesBaseline } from '../../../shared/storage/baseline';
import { ApiCheckQueue } from '../../../shared/api/apiCheckQueue';
import type { LocalStore } from '../../../shared/storage/LocalStore';
import { retargetSlot, rewriteOwnedKeys } from '../../../shared/storage/noteWrite';
import type { EntryWriteHooks } from '../../../shared/storage/noteWrite';
import type { ApiCheckKind, ApiCheckResult, EntryCache, LookupKind, Notify } from '../../../shared/storage/storageTypes';
import { checkResultOf, FAILED } from '../../../shared/api/lookup';
import type { LookupResult } from '../../../shared/api/lookup';
import type { SharedConfigStore } from '../../../shared/storage/SharedConfigStore';
import { TITLE_CACHE_KEYS, titleFromProperties, titleToProperties, isSingleMovie, seasonsPending, titleToCache, hasApiIdentity, pinSeasonsWithoutIdentity } from '../../../shared/storage/titleCodec';
import { decodeBook, decodeManga, encodeAirtime } from '../../../shared/storage/readingCodec';
import { decodeGame } from '../../../shared/storage/gameCodec';
import { AIRTIME_PROPS, COMMON_PROPS, TITLE_PROPS } from '../../../shared/storage/properties';
import { extractNotes, replaceNotesSection } from '../../../shared/storage/noteBody';
import { omit, sameJson } from '../../../shared/domain/sharedHelpers';
import { emitDataChanged } from '../../../shared/services/changeSignal';
import { ChangeNotifier } from '../../../shared/services/changeListeners';

/** Where DataManager hands titles that need a poster (the PosterService). */
export interface PosterQueue {
	enqueue(t: HoardTitle): Promise<unknown>;
}

/** Release date removal for reading items and games, which their own managers own (history, release-status rules). */
export interface ReleaseDateTargets {
	clearBookOrMangaReleaseDate(kind: 'book' | 'manga', id: string): Promise<void>;
	clearGameReleaseDate(id: string): Promise<void>;
}

const AIRTIME_KEYS: readonly string[] = Object.values(AIRTIME_PROPS);

/** Every property titleToProperties can emit; the full rewrite deletes the ones it omits. */
const TITLE_KEYS: readonly string[] = [
	...Object.values(COMMON_PROPS),
	...Object.values(TITLE_PROPS),
	...AIRTIME_KEYS,
];

function scheduleOf(a: EntryAirtime, releaseDate: string | null): AirtimeSchedule {
	const s: AirtimeSchedule = { recurrence: a.recurrence };
	if (a.recurrence === 'once' && releaseDate) s.releaseDate = releaseDate;
	if (a.time) s.releaseTime = a.time;
	if (a.day !== undefined && a.recurrence === 'weekly') s.dayOfWeek = a.day;
	if (a.day !== undefined && a.recurrence === 'monthly') s.dayOfMonth = a.day;
	return s;
}

/** Minimum gap between two API refreshes of a title's airing pointer, unless forced. */
/** Retry deadline per outcome of a background API check; a missing key waits until a key changes. */
const API_CHECK_TTL_MS = { ok: 6 * 3_600_000, transient: 3_600_000, notfound: 7 * 24 * 3_600_000 };
/** Every kind of check recorded in `apiCheck`; a key change resets the `nokey` ones of all. */
const API_CHECK_KINDS: readonly ApiCheckKind[] = ['airing', 'seasons', 'poster', 'trailer', 'credits', 'studio'];

/** Statuses whose unwatched episodes still count as time remaining. */
const COUNTED_REMAINING: readonly string[] = ['Plan to watch', 'Watching'];

/**
 * Watchlist titles, backed by one note per title. Reads come from the EntryIndex (frontmatter) plus
 * the LocalStore cache; writes go to the note via processFrontMatter and only touch what changed.
 */
export class DataManager extends ChangeNotifier
	implements TitleReader, TitleStats, TitleWriter, AirtimeStore, DraftStore, TitleMaintenance, TitleBackup {
	private historyManager: HistoryManager | null = null;

	// Mutable copies handed to the UI, one per id. `src` is the index entry the copy was made from:
	// it is the default baseline a write diffs against; a copy carries its own (see storage/baseline.ts),
	// so a stale or spread copy cannot revert a field changed elsewhere in between.
	private views: Map<string, { src: HoardTitle; view: HoardTitle }> = new Map();
	// `## Notes` body per id as last read from / written to the note
	private notes: Map<string, string> = new Map();
	// titles changed via updateTitleSilent, written on the next save()
	private dirty: Set<string> = new Set();
	// ids already handed to the poster queue this session
	private posterRequested: Set<string> = new Set();
	// background API checks (airing, seasons) share one throttled queue; results persist in the cache
	readonly apiQueue = new ApiCheckQueue();
	private seasonsInFlight: Set<string> = new Set();
	private seasonsRunning = 0;
	private seasonsChanged = false;
	/** Titles whose "API key needed" notice was shown this session. */
	private noKeyNoticeShown: Set<string> = new Set();

	// debounced save for high-frequency edits (rapid episode clicks): memory now, note coalesced
	private pendingSaveTimer: number | null = null;
	private pendingMdTitleIds: Set<string> = new Set();
	private readonly EPISODE_SAVE_DEBOUNCE_MS = 500;

	private airingInFlight: Set<string> = new Set();

	setHistoryManager(hm: HistoryManager): void {
		this.historyManager = hm;
	}

	constructor(
		private readonly entryNotes: EntryNotes,
		private readonly index: EntryIndex,
		private readonly local: LocalStore,
		private readonly shared: SharedConfigStore,
		private readonly notify: Notify,
		private readonly settings: SettingsReader,
		private readonly api: Pick<ApiService, 'fetchAiring' | 'fetchSeasons'>,
		/** Resolved per use: the poster service is created after the manager. */
		private readonly posters: () => PosterQueue | null,
		private readonly releaseDates: ReleaseDateTargets,
	) {
		super();
	}

	/** After index.build(): reads note bodies and follows index/vault changes. */
	async init(): Promise<void> {
		await Promise.all(this.index.titles().map((t) => this.readNotes(t.id)));
		this.index.onChange((ids) => {
			const changed = [...ids].map((id) => this.getTitle(id)).filter((t): t is HoardTitle => !!t);
			this.queueMissingPosters(changed);
			this.queueMissingSeasons(changed);
			this.notifyListeners();
		});
		this.entryNotes.watch((f) => void this.refreshNotes(f), (f, oldPath) => this.onVaultRename(f, oldPath));
		this.queueMissingPosters(this.getTitles());
		this.queueMissingSeasons(this.getTitles());
		this.notifyListeners();
	}

	/**
	 * Hands titles with an API identity but no cached poster (a fresh device, a note from elsewhere)
	 * to the poster queue, once per id and session.
	 */
	private queueMissingPosters(titles: HoardTitle[]): void {
		const service = this.posters();
		if (!service) return;
		for (const t of titles) {
			if (t.maybe || this.posterRequested.has(t.id)) continue;
			if (t.posterUrl || !this.lookupDue(t.id, 'poster')) continue;
			if (!hasApiIdentity(t)) continue;
			this.posterRequested.add(t.id);
			void service.enqueue(t);
		}
	}

	/**
	 * Seasons not known yet: an API identity, no seasons in note or cache, not a movie (a fresh device,
	 * a note from elsewhere), and the fetch has not found nothing or lacked a key (those use an implicit
	 * S01). Episode toggles wait for the refill.
	 */
	private seasonsPending(t: HoardTitle): boolean {
		return seasonsPending(t, this.local.getCache(t.id)?.apiCheck?.seasons?.result);
	}

	/** Seasons not known for a series with an API identity, whatever the last fetch returned. */
	private seasonsMissing(t: HoardTitle): boolean {
		return seasonsPending(t, undefined);
	}

	/** Queues a season fetch for titles that lack seasons and whose last check is past its deadline. */
	private queueMissingSeasons(titles: HoardTitle[]): void {
		for (const t of titles) {
			if (t.maybe || this.seasonsInFlight.has(t.id) || !this.seasonsMissing(t) || !this.apiCheckDue(t.id, 'seasons', false)) continue;
			void this.refillSeasons(t);
		}
	}

	/**
	 * Stores fetched seasons in the cache only (no note write); the notes are re-decoded once the queue is
	 * idle, also after "not found" or "no key" (the implicit S01 applies then).
	 */
	private async refillSeasons(t: HoardTitle): Promise<void> {
		this.seasonsInFlight.add(t.id);
		this.seasonsRunning++;
		try {
			let outcome: LookupResult<Season[]> = FAILED;
			try {
				outcome = await this.apiQueue.enqueue(() => this.api.fetchSeasons(t));
			} catch {
				// stays pending until the deadline
			}
			if (!this.index.get(t.id)) return;
			const seasons = outcome.status === 'found' ? outcome.value.map((x) => ({ name: x.name, episodes: x.episodes, offset: x.offset })) : [];
			const filled = seasons.length > 0;
			// a filled list is recorded as 'ok'; a found but empty one as 'notfound'
			const result = filled ? 'ok' : checkResultOf(outcome) ?? 'notfound';
			this.recordApiCheck(t.id, 'seasons', result, filled ? { seasons } : {});
			if (result !== 'transient') this.seasonsChanged = true;
		} finally {
			this.seasonsInFlight.delete(t.id);
			// decoding happens in the index; a rebuild picks up the new cache and emits the changed ids
			if (--this.seasonsRunning === 0 && this.seasonsChanged) {
				this.seasonsChanged = false;
				await this.index.rebuild();
			}
		}
	}

	/** True when the last check of this kind is past its deadline (never checked, or forced). */
	private apiCheckDue(id: string, kind: ApiCheckKind, force: boolean): boolean {
		if (force) return true;
		const cache = this.local.getCache(id);
		const check = cache?.apiCheck?.[kind];
		if (!check) {
			const refreshedAt = kind === 'airing' ? Date.parse(cache?.airing?.refreshedAt ?? '') : NaN;
			return isNaN(refreshedAt) || Date.now() - refreshedAt >= API_CHECK_TTL_MS.ok;
		}
		if (check.result === 'nokey') return false;
		const at = Date.parse(check.at);
		return isNaN(at) || Date.now() - at >= API_CHECK_TTL_MS[check.result];
	}

	/**
	 * True when a lookup of this kind should run: false while the value is there (a found value is
	 * final), else the retry deadline of the last recorded check decides.
	 */
	lookupDue(id: string, kind: LookupKind): boolean {
		const title = this.getTitle(id);
		if (title && this.hasLookupValue(title, kind)) return false;
		return this.apiCheckDue(id, kind, false);
	}

	private hasLookupValue(t: HoardTitle, kind: LookupKind): boolean {
		switch (kind) {
			case 'poster': return !!t.posterUrl;
			case 'trailer': return !!t.trailerUrl || !!t.manualTrailerUrl;
			case 'credits': return !!t.director?.length && !!t.cast?.length;
			case 'studio': return !!t.studio?.length;
		}
	}

	/** Records how a lookup ended, unless it found something (the value itself is the record). */
	recordLookup(id: string, kind: LookupKind, result: LookupResult<unknown>): void {
		const check = checkResultOf(result);
		if (check) this.recordApiCheck(id, kind, check);
	}

	private recordApiCheck(id: string, kind: ApiCheckKind, result: ApiCheckResult, patch: Partial<EntryCache> = {}): void {
		const apiCheck = { ...this.local.getCache(id)?.apiCheck, [kind]: { at: new Date().toISOString(), result } };
		// everything here comes from an API and can be fetched again: the save may wait for the batch
		this.local.setCache(id, { ...patch, apiCheck }, 'lazy');
	}

	/** An API key changed: checks that failed for want of a key may run again. */
	resetNoKeyChecks(): void {
		let changed = false;
		for (const entry of Object.values(this.local.data.cache)) {
			for (const kind of API_CHECK_KINDS) {
				if (entry.apiCheck?.[kind]?.result !== 'nokey') continue;
				delete entry.apiCheck[kind];
				changed = true;
			}
		}
		if (!changed) return;
		this.noKeyNoticeShown.clear();
		this.local.queueSave();
		this.queueMissingSeasons(this.index.titles());
	}

	/**
	 * True (and a notice) when an episode toggle must wait for the season refill. Without an API key the
	 * toggle goes on the implicit S01, with a one-time hint.
	 */
	private blockedBySeasonRefill(t: HoardTitle): boolean {
		if (!this.seasonsPending(t)) {
			const noKey = this.local.getCache(t.id)?.apiCheck?.seasons?.result === 'nokey';
			if (noKey && this.seasonsMissing(t) && !this.noKeyNoticeShown.has(t.id)) {
				this.noKeyNoticeShown.add(t.id);
				this.notify({ code: 'apiKeyNeeded' });
			}
			return false;
		}
		this.notify({ code: 'episodesLoading', title: t.title });
		this.queueMissingSeasons([t]);
		return true;
	}

	// Rows-view daily recommendations

	getRecommendedDaily(): RecommendedDaily {
		return this.local.data.ui.recommendedDaily ?? { date: '', ids: [] };
	}

	/**
	 * Silent daily-recommendation save — no listener notify; the Rows view that rolled the picks
	 * renders them itself.
	 */
	setRecommendedDaily(rec: RecommendedDaily): void {
		this.local.data.ui.recommendedDaily = rec;
		this.local.queueSave();
	}

	/**
	 * Silent poster update, no notify — the card that triggered the fetch updates its own <img>.
	 * A URL goes into the note's `Cover` property, but only when it is empty (E12), unless `overwrite`
	 * (the explicit refresh).
	 */
	async updatePosterUrl(titleId: string, url: string, overwrite = false): Promise<void> {
		const title = this.getTitle(titleId);
		if (!title) return;
		const hasPoster = !!title.posterUrl;
		if (!url || (hasPoster && !overwrite)) return;
		if (this.dirty.has(titleId) || this.pendingMdTitleIds.has(titleId)) {
			// the pending write carries it
			title.posterUrl = url;
			return;
		}
		const file = this.fileOf(titleId);
		if (!file) return;
		await this.processFrontMatter(file, title, (raw) => {
			const current = raw[COMMON_PROPS.cover];
			const own = typeof current === 'string' && current.trim() !== '' ? current : undefined;
			if (own && !overwrite) {
				title.posterUrl = own;
				return;
			}
			raw[COMMON_PROPS.cover] = url;
			title.posterUrl = url;
		}, !overwrite);
	}

	/** Silent TMDB id + collection cache. tmdbId null = not a movie, keep the verdict only. */
	updateTmdbIdentity(id: string, tmdbId: number | null, collectionId: number): void {
		const title = this.getTitle(id);
		if (!title) return;
		const nextTmdbId = tmdbId ?? title.tmdbId;
		if (title.tmdbId === nextTmdbId && title.collectionId === collectionId) return;
		// only ever a movie id here — the collections lookup rejects everything else
		if (nextTmdbId !== undefined) {
			title.tmdbId = nextTmdbId;
			title.tmdbMediaType = 'movie';
		}
		title.collectionId = collectionId;
		this.syncCache(title);
	}

	/** Silent community-rating update: memory + cache, no notify. The caller refreshes its own UI. */
	updateCommunityRating(
		id: string,
		rating: number,
		votes: number,
		source: '' | 'imdb' | 'mal' | 'anilist' | 'tmdb',
	): void {
		const title = this.getTitle(id);
		if (!title) return;
		title.communityRating = rating;
		title.communityVotes = votes;
		title.communitySource = source;
		title.communityRatingLastFetched = new Date().toISOString();
		this.syncCache(title);
	}

	/**
	 * Silent trailer URL update (manual refresh): memory + cache, no notify — the caller re-renders
	 * its own row.
	 */
	updateTrailerUrl(titleId: string, url: string): void {
		const title = this.getTitle(titleId);
		if (!title) return;
		title.trailerUrl = url;
		this.syncCache(title);
	}

	/**
	 * Persists a director/cast backfill to the cache only: API values never reach the note (E9), and
	 * a background backfill is no user edit (no dateModified stamp). User-added credits stay as they
	 * are; the merged view drops names the fetch now returns.
	 */
	updateCredits(titleId: string, director: string[], cast: string[]): Promise<void> {
		const title = this.getTitle(titleId);
		if (!title) return Promise.resolve();
		title.director = director;
		title.cast = cast;
		this.syncCache(title);
		this.notifyListeners();
		return Promise.resolve();
	}

	/** Studio backfill; cache only, like updateCredits. Caches the TMDB id it resolved. */
	updateStudio(
		titleId: string,
		studio: string[],
		tmdbId?: number,
		tmdbMediaType?: 'movie' | 'tv',
	): Promise<void> {
		const title = this.getTitle(titleId);
		if (!title) return Promise.resolve();
		title.studio = studio;
		if (tmdbId && tmdbMediaType) {
			title.tmdbId = tmdbId;
			title.tmdbMediaType = tmdbMediaType;
		}
		this.syncCache(title);
		this.notifyListeners();
		return Promise.resolve();
	}

	/**
	 * Replaces one field's user-added credits (the add modal commits additions and removals in one
	 * call). Uncapped by design — the API cap trims a fetched cast, not user input. Like
	 * updateCredits: no dateModified stamp.
	 */
	async updateManualCredits(titleId: string, field: CreditsField, names: string[]): Promise<void> {
		const title = this.getTitle(titleId);
		if (!title) return;
		const fetched =
			(field === 'director' ? title.director : field === 'cast' ? title.cast : title.studio) ?? [];
		const cleaned = pruneManualCredits(normalizeManualCredits(names), fetched);
		if (field === 'director') title.manualDirector = cleaned;
		else if (field === 'cast') title.manualCast = cleaned;
		else title.manualStudio = cleaned;
		await this.writeTitle(title);
		this.notifyListeners();
	}

	/**
	 * Silent favorite toggle: note only, no notify — the detail modal updates its own button and
	 * flags the change for the on-close refresh. No dateModified stamp.
	 */
	async setFavorite(id: string, favorite: boolean): Promise<void> {
		const title = this.getTitle(id);
		if (!title) return;
		// stamp drives the Favorites shelf order (newest first); cleared on unfavorite
		await this.writeTitle(favorite
			? { ...title, favorite, dateFavorited: new Date().toISOString() }
			: { ...omit(title, 'dateFavorited'), favorite });
	}

	/** Flush the pending device-local data (cache, drafts, settings) during plugin unload. */
	flushLocalData(): void {
		void this.local.flush();
	}

	/** Drafts-tab state (device-local). */
	getDrafts(): Partial<DraftPersistState> | undefined {
		return this.local.data.drafts;
	}

	setDrafts(state: DraftPersistState): void {
		this.local.data.drafts = state;
		this.local.queueSave();
	}

	/** Shared settings of the base file; never holds API keys. */
	getSharedSettings(): Record<string, unknown> {
		return structuredClone(this.shared.get().settings);
	}

	/** Backup restore: writes the shared settings into the base file. */
	async restoreSharedSettings(settings: Record<string, unknown>): Promise<void> {
		await this.shared.update(settings);
	}

	flushQueuedSaveSync(): void {
		void this.local.flush();
	}

	/** Writes data.json now. Reading, games and history route their saves through here. */
	async persist(): Promise<void> {
		this.local.queueSave();
		await this.local.flush();
	}

	/**
	 * Writes titles changed via updateTitleSilent (and pending episode toggles), syncs in-memory API
	 * data to the cache, then notifies.
	 */
	async save(): Promise<void> {
		// an immediate save supersedes any pending debounced one
		if (this.pendingSaveTimer !== null) {
			window.clearTimeout(this.pendingSaveTimer);
			this.pendingSaveTimer = null;
		}
		await this.writePending();
		// a copy from before a change underneath (season refill, external edit) holds outdated API data
		for (const { view } of this.views.values()) if (this.basedOnStored(view)) this.syncCache(view);
		this.notifyListeners();
	}

	/**
	 * Schedule a debounced silent note write (no notify, no re-render). Later calls reset the timer;
	 * callers own any targeted DOM updates.
	 */
	scheduleEpisodeSave(titleIdForMd: string): void {
		this.pendingMdTitleIds.add(titleIdForMd);
		if (this.pendingSaveTimer !== null) {
			window.clearTimeout(this.pendingSaveTimer);
		}
		this.pendingSaveTimer = window.setTimeout(() => {
			void this.flushPendingSave();
		}, this.EPISODE_SAVE_DEBOUNCE_MS);
	}

	/** Flush a pending debounced save now (e.g. on view close / plugin unload). */
	async flushPendingSave(): Promise<void> {
		if (this.pendingSaveTimer !== null) {
			window.clearTimeout(this.pendingSaveTimer);
			this.pendingSaveTimer = null;
		}
		await this.writePending();
	}

	/** Writes the titles with pending silent or episode edits. */
	private async writePending(): Promise<void> {
		const ids = new Set([...this.dirty, ...this.pendingMdTitleIds]);
		// resolved while the ids are still pending: a copy that no longer matches the index entry (rename) is kept only then
		const titles = [...ids].map((id) => ({ id, t: this.getTitle(id) }));
		this.dirty.clear();
		this.pendingMdTitleIds.clear();
		for (const { id, t } of titles) {
			if (t) await this.writeTitle(t);
			else this.notify({ code: 'editLost', id });
		}
	}

	/** Starts a pending episode write during plugin unload (cannot be awaited there). */
	flushPendingSaveSync(): void {
		void this.flushPendingSave();
	}

	// Reads

	/** Mutable copy of an index entry; stable per id until the note changes underneath. */
	private viewOf(src: HoardTitle): HoardTitle {
		const slot = this.views.get(src.id);
		if (slot && slot.src === src) return slot.view;
		// a pending silent edit keeps its copy until written
		if (slot && (this.dirty.has(src.id) || this.pendingMdTitleIds.has(src.id))) return slot.view;
		const view = structuredClone(src);
		view.notes = this.notes.get(src.id) ?? '';
		setNotesBaseline(view, view.notes);
		// nothing cached yet: '' (not undefined) lets the lazy poster fetch pick it up
		if (view.posterUrl === undefined) view.posterUrl = '';
		this.views.set(src.id, { src, view });
		setBaseline(view, src);
		return view;
	}

	/** Library titles; Maybe notes are listed by getMaybeTitles. */
	getTitles(): HoardTitle[] {
		return this.index.titles().filter((t) => !t.maybe).map((t) => this.viewOf(t));
	}

	getTitle(id: string): HoardTitle | undefined {
		const e = this.index.get(id);
		return e?.kind === 'title' ? this.viewOf(e.entry) : undefined;
	}

	async addTitle(title: HoardTitle): Promise<void> {
		// a fresh title needs posterUrl '' (not undefined) so the Cards needs-poster gate enqueues an
		// auto-fetch on first render
		if (title.posterUrl === undefined) title.posterUrl = '';
		if (title.trailerUrl === undefined) title.trailerUrl = '';
		if (title.manualTrailerUrl === undefined) title.manualTrailerUrl = '';
		// a future release date makes it "To be released", which puts it in Upcoming
		if (this.canAutoAddToUpcoming(title)) title.status = 'To be released';
		await this.insertNote(title);
		this.notifyListeners();
		const now = new Date().toISOString();
		void this.historyManager?.log(
			`${title.title} (${title.type}) was added on ${formatHistoryDate(now)}`,
			{ source: 'Watchlist', action: 'added', titleName: title.title, titleId: title.id },
		);
	}

	/** Add without re-rendering. Caller must call notifyChange() after the batch. */
	async addTitleSilent(title: HoardTitle): Promise<void> {
		if (this.canAutoAddToUpcoming(title)) title.status = 'To be released';
		await this.insertNote(title);
	}

	/**
	 * Creates the title's note, or takes over a Maybe note at the same path: same note, `maybe`
	 * dropped, fields from `title`; its `## Notes` survive when `title` brings none.
	 */
	private async insertNote(title: HoardTitle): Promise<void> {
		const id = this.entryNotes.idOf(this.entryNotes.pathFor('title', title.title, title.type));
		const maybe = this.index.get(id);
		if (maybe?.kind !== 'title' || !maybe.entry.maybe) {
			await this.createNote(title);
			return;
		}
		title.id = id;
		if (!title.notes) title.notes = this.notes.get(id) ?? '';
		const adopted = omit(title, 'maybe');
		setNotesBaseline(adopted, this.notes.get(id) ?? '');
		this.views.set(id, { src: maybe.entry, view: adopted });
		setBaseline(adopted, maybe.entry);
		await this.writeTitle(adopted);
	}

	/** Batch-add: one note per title; ids are rewritten to the created note paths. */
	async addTitleBatch(titles: HoardTitle[]): Promise<void> {
		for (const title of titles) {
			await this.addTitleSilent(title);
		}
	}

	/** Remove multiple titles in one batch: single notify, notes trashed in chunks of 10. */
	async removeTitlesBatch(ids: string[]): Promise<void> {
		const CHUNK_SIZE = 10;
		for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
			const chunk = ids.slice(i, i + CHUNK_SIZE);
			await Promise.all(chunk.map((id) => this.deleteNote(id)));
		}
		this.notifyListeners();
	}

	canAutoAddToUpcoming(title: HoardTitle): boolean {
		if (!title.releaseDate) return false;
		// only auto-add with a full YYYY-MM-DD date
		if (!/^\d{4}-\d{2}-\d{2}$/.test(title.releaseDate)) return false;
		const release = new Date(title.releaseDate + 'T12:00:00');
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return release > today;
	}

	/**
	 * Reconciles the auto "To be released" status with a release-date edit; Upcoming follows from it.
	 * A future full date forces the status; a past or cleared date reverts a "To be released" title
	 * to "Plan to watch" and drops its manual schedule.
	 *
	 * Call after `releaseDate` has been written and persisted.
	 */
	async applyReleaseDateChange(title: HoardTitle): Promise<void> {
		const releaseDate = title.releaseDate;
		const isFullDate = !!releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate);
		if (isFullDate && isReleaseDateFuture(releaseDate)) {
			if (title.status !== 'To be released') {
				title.status = 'To be released';
				await this.updateTitle(title);
			}
		} else if ((isFullDate || !releaseDate) && title.status === 'To be released') {
			// date is past/today or cleared — the auto status no longer applies
			title.status = 'Plan to watch';
			await this.updateTitle(omit(title, 'airtime'));
		}
	}

	/** Drops a title's manual Upcoming schedule (e.g. when the date goes past). */
	async removeAirtimeEntriesForTitle(titleId: string): Promise<void> {
		const title = this.getTitle(titleId);
		if (!title?.airtime) return;
		await this.writeTitle(omit(title, 'airtime'));
		this.notifyListeners();
	}

	// Reading / Games → Upcoming bridge. Their schedules live on their own notes; a future release
	// date shows up on its own, so the auto-add calls are no-ops.

	async autoAddReadingToUpcoming(_item: Book | Manga, _kind: 'book' | 'manga'): Promise<void> {}

	/** Drops a reading item's manual schedule (release date gone past, or item deleted). */
	async removeReadingAirtimeEntries(itemId: string): Promise<void> {
		await this.removeNoteAirtime(itemId);
	}

	generateReadingAirtimeId(itemId: string): string {
		return `airtime-reading-${itemId}`;
	}

	async autoAddGameToUpcoming(_game: Game): Promise<void> {}

	/** Drops a game's manual schedule (release date gone past, or game deleted). */
	async removeGameAirtimeEntries(gameId: string): Promise<void> {
		await this.removeNoteAirtime(gameId);
	}

	generateGameAirtimeId(gameId: string): string {
		return `airtime-game-${gameId}`;
	}

	private async removeNoteAirtime(id: string): Promise<void> {
		const e = this.index.get(id);
		if (!e?.entry.airtime) return;
		if (e.kind === 'title') await this.removeAirtimeEntriesForTitle(id);
		else if (await this.writeAirtime(e, undefined, null)) this.notifyListeners();
	}

	/** Logs rating / completion changes against the stored state. */
	private logChanges(updated: HoardTitle): void {
		const old = this.baselineOf(updated);
		if (!old) return;
		const now = new Date().toISOString();
		if (old.rating !== updated.rating) {
			void this.historyManager?.log(
				`${updated.title} (${updated.type}) was reviewed on ${formatHistoryDate(now)}`,
				{ source: 'Watchlist', action: 'rating', titleName: updated.title, titleId: updated.id },
			);
		}
		if (old.status !== updated.status && updated.status === 'Completed') this.logCompleted(updated);
	}

	private logCompleted(title: HoardTitle): void {
		void this.historyManager?.log(
			`${title.title} (${title.type}) was marked as watched on ${formatHistoryDate(new Date().toISOString())}`,
			{ source: 'Watchlist', action: 'completed', titleName: title.title, titleId: title.id },
		);
	}

	async updateTitle(updated: HoardTitle): Promise<void> {
		if (!this.getTitle(updated.id)) return;
		updated.dateModified = new Date().toISOString();
		if (updated.status === 'Completed') {
			updated.priority = '';
		}
		this.logChanges(updated);
		this.dirty.delete(updated.id);
		await this.writeTitle(updated);
		this.notifyListeners();
	}

	/**
	 * Update without writing or notifying. Caller must save() once after the batch (or write the note
	 * itself via updateMarkdownFile).
	 */
	updateTitleSilent(updated: HoardTitle): void {
		const slot = this.views.get(updated.id);
		if (!slot) return;
		updated.dateModified = new Date().toISOString();
		if (updated.status === 'Completed') {
			updated.priority = '';
		}
		this.logChanges(updated);
		const base = this.baselineOf(updated);
		if (base) setBaseline(updated, base);
		slot.view = updated;
		this.dirty.add(updated.id);
	}

	async removeTitle(id: string): Promise<void> {
		const title = this.getTitle(id);
		if (title) {
			const now = new Date().toISOString();
			void this.historyManager?.log(
				`${title.title} (${title.type}) was deleted on ${formatHistoryDate(now)}`,
				{ source: 'Watchlist', action: 'deleted', titleName: title.title, titleId: title.id },
			);
		}
		await this.deleteNote(id);
		this.notifyListeners();
	}

	// Groups: derived from the titles' `groups` property; a group's id is its name

	getGroups(): HoardGroup[] {
		const byName = new Map<string, HoardGroup>();
		for (const t of this.index.titles()) {
			if (t.maybe) continue;
			for (const name of t.groups ?? []) {
				let g = byName.get(name);
				if (!g) {
					g = { id: name, name, titleIds: [], dateAdded: t.dateAdded };
					byName.set(name, g);
				}
				g.titleIds.push(t.id);
				// a group is as old as its oldest member
				if (t.dateAdded && (!g.dateAdded || t.dateAdded < g.dateAdded)) g.dateAdded = t.dateAdded;
			}
		}
		return [...byName.values()].sort((a, b) => a.dateAdded.localeCompare(b.dateAdded) || a.name.localeCompare(b.name));
	}

	getGroup(id: string): HoardGroup | undefined {
		return this.getGroups().find((g) => g.id === id);
	}

	/** Writes the group name onto its members. A group without members only leaves a history line. */
	async addGroup(group: HoardGroup): Promise<void> {
		if (!this.getGroup(group.name)) {
			void this.historyManager?.log(`Group "${group.name}" was created`, { source: 'Watchlist' });
		}
		group.id = group.name;
		for (const id of group.titleIds) {
			await this.setTitleGroups(id, (names) => [...names, group.name]);
		}
		this.notifyListeners();
	}

	/** Applies a rename (new `name`, same `id`) and membership changes to the members' `groups`. */
	async updateGroup(updated: HoardGroup): Promise<void> {
		const old = this.getGroup(updated.id);
		if (!old) return;
		const keep = new Set(updated.titleIds);
		for (const id of new Set([...old.titleIds, ...updated.titleIds])) {
			await this.setTitleGroups(id, (names) => {
				const i = names.indexOf(old.name);
				const rest = names.filter((n) => n !== old.name);
				if (!keep.has(id)) return rest;
				rest.splice(i < 0 ? rest.length : i, 0, updated.name);
				return rest;
			});
		}
		if (old.name !== updated.name && this.local.data.ui.pinnedGroup === old.id) {
			this.local.data.ui.pinnedGroup = updated.name;
			this.local.queueSave();
		}
		this.notifyListeners();
	}

	async removeGroup(id: string): Promise<void> {
		const group = this.getGroup(id);
		if (!group) return;
		for (const titleId of group.titleIds) {
			await this.setTitleGroups(titleId, (names) => names.filter((n) => n !== group.name));
		}
		this.notifyListeners();
	}

	async addTitleToGroup(groupId: string, titleId: string): Promise<void> {
		await this.setTitleGroups(titleId, (names) => [...names, groupId]);
		this.notifyListeners();
	}

	/** Rewrites one title's `groups` (deduplicated); no dateModified stamp, like the other backfills. */
	private async setTitleGroups(id: string, fn: (names: string[]) => string[]): Promise<void> {
		const title = this.getTitle(id);
		if (!title) return;
		const before = title.groups ?? [];
		const next = [...new Set(fn([...before]))];
		if (sameJson(before, next)) return;
		await this.writeTitle(next.length > 0 ? { ...title, groups: next } : omit(title, 'groups'));
	}

	getGroupedTitleIds(): Set<string> {
		const ids = new Set<string>();
		for (const group of this.getGroups()) {
			for (const id of group.titleIds) {
				ids.add(id);
			}
		}
		return ids;
	}

	/** A group's id is its name; an existing name joins that group. */
	generateGroupId(name: string): string {
		return name.trim();
	}

	// Pinned group (device-local UI state)

	getPinnedGroupId(): string | null {
		return this.local.data.ui.pinnedGroup ?? null;
	}

	async setPinnedGroupId(id: string | null): Promise<void> {
		this.local.data.ui.pinnedGroup = id;
		await this.persist();
		this.notifyListeners();
	}

	// Saved filter preset (device-local UI state)

	getSavedFilterPreset(): SavedFilterPreset | null {
		return this.local.data.ui.savedFilterPreset ?? null;
	}

	async setSavedFilterPreset(preset: SavedFilterPreset | null): Promise<void> {
		this.local.data.ui.savedFilterPreset = preset;
		await this.persist();
		this.notifyListeners();
	}

	// Upcoming: manual schedules from the notes' airtime keys, plus a derived 'once' entry for every
	// "To be released" entry with a release date. One entry per note, with a stable id.

	getAirtimeEntries(): AirtimeEntry[] {
		const inputs: AnyEntry[] = [
			...this.index.titles().filter((t) => !t.maybe).map((entry) => ({ kind: 'title' as const, entry })),
			...this.index.books().map((entry) => ({ kind: 'book' as const, entry })),
			...this.index.manga().map((entry) => ({ kind: 'manga' as const, entry })),
			...this.index.games().map((entry) => ({ kind: 'game' as const, entry })),
		];
		const out: AirtimeEntry[] = [];
		for (const input of inputs) {
			const e = this.airtimeEntryOf(input);
			if (e) out.push(e);
		}
		return out;
	}

	private airtimeEntryOf(e: AnyEntry): AirtimeEntry | null {
		const base = this.airtimeBase(e);
		const noteAirtime = e.entry.airtime;
		if (noteAirtime) return this.applyNoteAirtime(base, e, noteAirtime);
		if (!this.isAwaitingRelease(e) || !e.entry.releaseDate) return null;
		base.schedule.releaseDate = e.entry.releaseDate;
		return base;
	}

	private airtimeBase(e: AnyEntry): AirtimeEntry {
		const { id, dateAdded } = e.entry;
		const schedule: AirtimeSchedule = { recurrence: 'once' };
		if (e.kind === 'title') return { id: this.generateAirtimeId(id), titleId: id, schedule, dateAdded };
		if (e.kind === 'game') return { id: this.generateGameAirtimeId(id), titleId: id, source: 'game', schedule, dateAdded };
		return { id: this.generateReadingAirtimeId(id), titleId: id, source: 'reading', readingKind: e.kind, schedule, dateAdded };
	}

	private applyNoteAirtime(base: AirtimeEntry, e: AnyEntry, a: EntryAirtime): AirtimeEntry {
		base.schedule = scheduleOf(a, e.entry.releaseDate);
		if (a.season !== undefined) base.currentSeason = a.season;
		if (a.episode !== undefined) base.currentEpisode = a.episode;
		if (a.acknowledged) base.lastAcknowledgedDate = a.acknowledged;
		// the API pointer wins over the note's: a tick only acknowledges it
		const airing = this.airingOf(e);
		if (airing?.nextEpisode !== undefined) {
			base.currentEpisode = airing.nextEpisode;
			if (airing.nextSeason !== undefined) base.currentSeason = airing.nextSeason;
		}
		return base;
	}

	/**
	 * "To be released" with a release date. Reading and Games force that status while the date is
	 * in the future, so a future date counts there even before the status is written.
	 */
	private isAwaitingRelease(e: AnyEntry): boolean {
		const { status, releaseDate } = e.entry;
		if (!releaseDate) return false;
		if (e.kind === 'title') return status === 'To be released';
		const auto = e.kind === 'game' ? GAME_AUTO_STATUS : 'To be released';
		return status === auto || isReleaseDateFuture(releaseDate);
	}

	/** Cached API airing data of a recurring watch schedule; other entries have none. */
	private airingOf(e: AnyEntry): EntryCache['airing'] | undefined {
		if (e.kind !== 'title' || !e.entry.airtime || e.entry.airtime.recurrence === 'once') return undefined;
		return this.local.getCache(e.entry.id)?.airing;
	}

	/** True when the entry's episode pointer comes from the API cache instead of the note. */
	isAiringTracked(entry: AirtimeEntry): boolean {
		const e = this.index.get(entry.titleId);
		return !!e && this.airingOf(e)?.nextEpisode !== undefined;
	}

	/**
	 * Tick on an aired unit: records the acknowledgement so the countdown resets. Without an API
	 * pointer it also advances the note's unit; with one, the API moves the pointer.
	 */
	async tickAirtimeEntry(entry: AirtimeEntry, date: string): Promise<void> {
		const e = this.index.get(entry.titleId);
		if (e?.entry.airtime && this.isAiringTracked(entry)) {
			if (await this.writeAirtime(e, { ...e.entry.airtime, acknowledged: date }, null)) this.notifyListeners();
			return;
		}
		await this.updateAirtimeEntry({ ...entry, currentEpisode: (entry.currentEpisode ?? 1) + 1, lastAcknowledgedDate: date });
	}

	/**
	 * Reloads the airing pointer of a title from its API into the cache through the shared queue.
	 * The persisted last check (apiCheck.airing) sets the deadline; `force` skips only that. Never writes the note.
	 */
	async refreshAiring(id: string, force = false): Promise<void> {
		const e = this.index.get(id);
		if (e?.kind !== 'title' || this.airingInFlight.has(id) || !this.apiCheckDue(id, 'airing', force)) return;
		this.airingInFlight.add(id);
		try {
			const outcome = await this.apiQueue.enqueue(() => this.api.fetchAiring(e.entry));
			if (this.index.get(id)?.kind !== 'title') return;
			// a found airing is recorded as 'ok' (checkResultOf records nothing for found)
			this.recordApiCheck(id, 'airing', checkResultOf(outcome) ?? 'ok', outcome.status === 'found' ? { airing: outcome.value } : {});
			if (outcome.status === 'found') this.notifyListeners();
		} catch (err) {
			console.warn(`Hoard: could not refresh airing data of ${id}`, err);
		} finally {
			this.airingInFlight.delete(id);
		}
	}

	/** True when removing this entry clears the item's release date: only the derived card does. */
	removeClearsReleaseDate(entry: AirtimeEntry): boolean {
		const e = this.index.get(entry.titleId);
		return !!e && !e.entry.airtime && this.isAwaitingRelease(e);
	}

	async addAirtimeEntry(entry: AirtimeEntry): Promise<void> {
		await this.updateAirtimeEntry(entry);
	}

	/** Writes the entry's schedule to its note; a 'once' date goes to the note's releaseDate. */
	async updateAirtimeEntry(updated: AirtimeEntry): Promise<void> {
		const e = this.index.get(updated.titleId);
		if (!e) return;
		const releaseDate = updated.schedule.recurrence === 'once' ? updated.schedule.releaseDate ?? null : null;
		if (await this.writeAirtime(e, toEntryAirtime(updated), releaseDate)) this.notifyListeners();
	}

	async removeAirtimeEntry(id: string): Promise<void> {
		await this.removeAirtimeEntriesBatch([id]);
	}

	/**
	 * Removes what the card shows: a manual schedule drops only its airtime keys (the release date
	 * stays, so a "To be released" item falls back to its derived premiere card); a derived card
	 * clears the release date, and the status follows from the usual release-date rules.
	 */
	async removeAirtimeEntriesBatch(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		const remove = new Set(ids);
		for (const entry of this.getAirtimeEntries().filter((x) => remove.has(x.id))) {
			const e = this.index.get(entry.titleId);
			if (!e) continue;
			if (e.entry.airtime) {
				await this.writeAirtime(e, undefined, null);
			} else if (e.kind === 'title') {
				const title = this.getTitle(e.entry.id);
				if (!title) continue;
				title.releaseDate = null;
				await this.writeTitle(title);
				await this.applyReleaseDateChange(title);
			} else {
				await this.clearReleaseDate(e);
			}
		}
		this.notifyListeners();
	}

	/** Reading / game release date removal through their managers (history, release-status rules). */
	private async clearReleaseDate(e: AnyEntry): Promise<void> {
		if (e.kind === 'book' || e.kind === 'manga') await this.releaseDates.clearBookOrMangaReleaseDate(e.kind, e.entry.id);
		else if (e.kind === 'game') await this.releaseDates.clearGameReleaseDate(e.entry.id);
	}

	/**
	 * Sets (or with undefined removes) the airtime keys of an entry's note, plus the 'once' release
	 * date when given. Titles go through writeTitle; other notes get just these keys.
	 */
	private async writeAirtime(e: AnyEntry, airtime: EntryAirtime | undefined, releaseDate: string | null): Promise<boolean> {
		if (e.kind === 'title') {
			const title = this.getTitle(e.entry.id);
			if (!title) return false;
			const scheduled = airtime ? { ...title, airtime } : omit(title, 'airtime');
			await this.writeTitle(releaseDate ? { ...scheduled, releaseDate } : scheduled);
			return true;
		}
		const file = this.fileOf(e.entry.id);
		if (!file) return false;
		const id = e.entry.id;
		const kind = e.kind;
		return this.entryNotes.updateProperties(file, (raw: Record<string, unknown>) => {
			for (const key of AIRTIME_KEYS) delete raw[key];
			encodeAirtime(airtime, raw);
			if (releaseDate) raw[COMMON_PROPS.releaseDate] = releaseDate;
			const fm = { ...raw };
			this.index.applyLocal(
				kind === 'game'
					? { kind, entry: decodeGame(id, fm).entry }
					: kind === 'book'
						? { kind, entry: decodeBook(id, fm, this.index.columns('book')).entry }
						: { kind, entry: decodeManga(id, fm, this.index.columns('manga')).entry },
			);
		});
	}

	// Maybe: title notes flagged `maybe: true`, kept out of getTitles()

	getMaybeTitles(): MaybeTitle[] {
		return this.index.titles()
			.filter((t) => t.maybe)
			.map((t) => ({
				id: t.id,
				title: t.title,
				type: t.type,
				releaseDate: t.releaseDate,
				externalLink: t.externalLink,
				totalEpisodes: t.totalEpisodes,
				episodeDuration: t.episodeDuration,
				dateAdded: t.dateAdded,
			}));
	}

	/** Creates the Maybe note; `title.id` is rewritten to its path. */
	async addMaybeTitle(title: MaybeTitle): Promise<void> {
		const note = newTitle({
			id: title.id,
			title: title.title,
			type: title.type,
			totalEpisodes: title.totalEpisodes,
			episodeDuration: title.episodeDuration,
			releaseDate: title.releaseDate,
			externalLink: title.externalLink,
			maybe: true,
		}, title.dateAdded);
		await this.createNote(note);
		title.id = note.id;
		this.notifyListeners();
	}

	async removeMaybeTitle(id: string): Promise<void> {
		const e = this.index.get(id);
		if (e?.kind !== 'title' || !e.entry.maybe) return;
		await this.deleteNote(id);
		this.notifyListeners();
	}

	/** Provisional id; the note path replaces it in addMaybeTitle. */
	generateMaybeId(titleName: string): string {
		return 'maybe-' + titleName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	generateAirtimeId(titleId: string): string {
		return `airtime-${titleId}`;
	}

	// Time calculations

	calcTimeWatched(title: HoardTitle): number {
		if (title.episodeDuration <= 0) return 0;
		// "To be released" titles haven't been watched yet
		if (title.status === 'To be released') return 0;
		if (title.type === 'Movie') {
			return title.watchedEpisodes.includes(1) ? title.episodeDuration : 0;
		}
		if (title.status === 'Completed') {
			return this.getEffectiveTotal(title) * title.episodeDuration;
		}
		return title.watchedEpisodes.length * title.episodeDuration;
	}

	calcTimeRemaining(title: HoardTitle): number {
		if (title.status === 'Dropped') return 0;
		return this.remainingTime(title, COUNTED_REMAINING);
	}

	calcTimeRemainingForModal(title: HoardTitle): number {
		return this.remainingTime(title, [...COUNTED_REMAINING, 'Dropped']);
	}

	/** Unwatched time of a title whose status is one of `counted`; a movie counts until watched. */
	private remainingTime(title: HoardTitle, counted: readonly string[]): number {
		if (title.episodeDuration <= 0) return 0;
		// "To be released" is not yet available
		if (title.status === 'To be released') return 0;
		if (title.type === 'Movie') {
			return title.watchedEpisodes.includes(1) ? 0 : title.episodeDuration;
		}
		if (!counted.includes(title.status)) return 0;
		return Math.max(0, this.getEffectiveTotal(title) - title.watchedEpisodes.length) * title.episodeDuration;
	}

	getTotalTimeWatched(): number {
		return this.getTitles().reduce((sum, t) => sum + this.calcTimeWatched(t), 0);
	}

	getTotalTimeRemaining(): number {
		return this.getTitles().reduce((sum, t) => sum + this.calcTimeRemaining(t), 0);
	}

	// Listeners

	protected override notifyListeners(): void {
		super.notifyListeners();
		emitDataChanged();
	}

	// Season collapse persistence (device-local UI state)

	getCollapsedSeasonsForTitle(titleId: string): Set<number> {
		return new Set<number>(this.local.data.ui.collapsedSeasons?.[titleId] ?? []);
	}

	async persistCollapsedSeasons(titleId: string, seasons: Set<number>): Promise<void> {
		const ui = this.local.data.ui;
		ui.collapsedSeasons = { ...ui.collapsedSeasons, [titleId]: Array.from(seasons) };
		await this.persist();
		this.notifyListeners();
	}

	// Skip helpers

	getTotalSkippedCount(title: HoardTitle): number {
		return title.seasons.reduce((sum, s) => sum + (s.skippedEpisodes?.length ?? 0), 0);
	}

	/** totalEpisodes minus all season-defined skipped episodes. */
	getEffectiveTotal(title: HoardTitle): number {
		return Math.max(0, title.totalEpisodes - this.getTotalSkippedCount(title));
	}

	/**
	 * In-memory toggle of an episode's watched state plus auto-complete. Schedules a debounced save
	 * and does NOT notify — the caller owns targeted DOM updates. Returns the mutated title.
	 */
	applyEpisodeWatchedToggle(
		id: string,
		episodeNumber: number,
		watched: boolean,
	): HoardTitle | null {
		const title = this.getTitle(id);
		if (!title || this.blockedBySeasonRefill(title)) return null;

		this.toggleEpisode(title, episodeNumber, watched);
		if (watched) this.logEpisodeWatched(title, episodeNumber);

		title.dateModified = new Date().toISOString();
		const wasCompleted = title.status === 'Completed';
		this.applyAutoCompleteRules(title);
		// the debounced write skips updateTitle's logChanges, so the completion is logged here
		if (!wasCompleted && title.status === 'Completed') this.logCompleted(title);
		this.scheduleEpisodeSave(id);
		return title;
	}

	private logEpisodeWatched(title: HoardTitle, episodeNumber: number): void {
		const when = formatHistoryDate(new Date().toISOString());
		const text = title.totalEpisodes > 1
			? `${title.title} (${title.type}) episode ${episodeNumber} was marked as watched on ${when}`
			: `${title.title} (${title.type}) was marked as watched on ${when}`;
		void this.historyManager?.log(text, {
			source: 'Watchlist', action: 'watched', titleName: title.title, titleId: title.id,
		});
	}

	/** Adds (sorted, deduplicated) or removes one episode in the watched list. */
	private toggleEpisode(title: HoardTitle, episodeNumber: number, watched: boolean): void {
		if (!watched) {
			title.watchedEpisodes = title.watchedEpisodes.filter((e) => e !== episodeNumber);
		} else if (!title.watchedEpisodes.includes(episodeNumber)) {
			title.watchedEpisodes.push(episodeNumber);
			title.watchedEpisodes.sort((a, b) => a - b);
		}
	}

	/** Shared auto-complete / un-complete rules. Mutates title in place. */
	private applyAutoCompleteRules(title: HoardTitle): void {
		const effectiveTotal = this.getEffectiveTotal(title);
		if (
			this.settings.get().autoCompleteOnLastEpisode &&
			effectiveTotal > 0 &&
			title.watchedEpisodes.length >= effectiveTotal
		) {
			if (title.status !== 'Completed') {
				title.status = 'Completed';
				// match updateTitle(): completed titles drop priority
				title.priority = '';
			}
			if (this.settings.get().setFinishDateAutomatically && !title.dateFinished) {
				title.dateFinished = todayIso();
			}
		} else if (title.status === 'Completed' && title.watchedEpisodes.length < effectiveTotal) {
			title.status = 'Watching';
			title.dateFinished = null;
		}
	}

	// Progress helpers

	getProgress(title: HoardTitle): number {
		const effective = this.getEffectiveTotal(title);
		if (effective === 0) return 0;
		return Math.min(100, Math.round((title.watchedEpisodes.length / effective) * 100));
	}

	getNextUnwatchedEpisode(title: HoardTitle): number | null {
		const watched = new Set(title.watchedEpisodes);
		for (let i = 1; i <= title.totalEpisodes; i++) {
			if (!watched.has(i)) return i;
		}
		return null;
	}

	async markEpisodeWatched(id: string, episodeNumber: number, watched: boolean): Promise<void> {
		const title = this.getTitle(id);
		if (!title || this.blockedBySeasonRefill(title)) return;

		this.toggleEpisode(title, episodeNumber, watched);
		if (watched) this.logEpisodeWatched(title, episodeNumber);

		this.applyAutoCompleteRules(title);

		await this.updateTitle(title);
	}

	async markSeasonWatched(
		id: string,
		episodeNumbers: number[],
		watched: boolean,
		seasonLabel?: string,
	): Promise<void> {
		const title = this.getTitle(id);
		if (!title || this.blockedBySeasonRefill(title)) return;

		// capture season completion BEFORE the tick, to detect a not-complete → complete transition
		const before = new Set(title.watchedEpisodes);
		const wasComplete = episodeNumbers.length > 0 && episodeNumbers.every((ep) => before.has(ep));

		if (watched) {
			const set = new Set(title.watchedEpisodes);
			for (const ep of episodeNumbers) set.add(ep);
			title.watchedEpisodes = Array.from(set).sort((a, b) => a - b);
		} else {
			const remove = new Set(episodeNumbers);
			title.watchedEpisodes = title.watchedEpisodes.filter((e) => !remove.has(e));
		}

		// "tick entire season" emits ONE history entry, and only when the action makes the season newly
		// complete — not when clearing, already complete, or without a season label
		if (watched && seasonLabel) {
			const after = new Set(title.watchedEpisodes);
			const nowComplete = episodeNumbers.length > 0 && episodeNumbers.every((ep) => after.has(ep));
			if (!wasComplete && nowComplete) {
				const now = new Date().toISOString();
				void this.historyManager?.log(
					`${title.title} (${title.type}) ${seasonLabel} was fully watched on ${formatHistoryDate(now)}`,
					{ source: 'Watchlist', action: 'watched', titleName: title.title, titleId: title.id },
				);
			}
		}

		this.applyAutoCompleteRules(title);

		await this.updateTitle(title);
	}

	// Folder management

	async ensureFolders(): Promise<void> {
		if (!this.settings.get().autoCreateFolders) return;
		if (this.entryNotes.root) await this.ensureFolder(this.entryNotes.root);
		for (const type of this.settings.get().types) {
			await this.ensureFolder(this.entryNotes.folderFor('title', type.name));
		}
	}

	async ensureFolder(path: string): Promise<void> {
		await this.entryNotes.ensureFolder(path);
	}

	/** Path of the title's note: its id below the root. */
	getNoteFilePath(title: HoardTitle): string {
		return this.entryNotes.pathOf(title.id);
	}

	/** Writes the title's note (creates it when missing). */
	async updateMarkdownFile(title: HoardTitle): Promise<void> {
		await this.writeTitle(title);
	}

	/** Reads the `## Notes` body back from a title note. null when the file or section is absent. */
	async readNotesFromFile(title: HoardTitle): Promise<string | null> {
		const file = this.fileOf(title.id);
		if (!file) return null;
		const notes = extractNotes(await this.entryNotes.read(file));
		this.notes.set(title.id, notes ?? '');
		return notes;
	}

	async createMarkdownFileIfMissing(title: HoardTitle): Promise<boolean> {
		if (this.fileOf(title.id)) return false;
		await this.createNote(title);
		return true;
	}

	/**
	 * Rewrites every plugin-owned frontmatter key of an existing title note, body verbatim. Keys the
	 * encoder omits are removed, except progress text kept while seasons are unknown and fields the
	 * decoder could not read. API overrides in the note are encoded, so they stay. Does NOT create the
	 * file — returns false then. Powers the bulk "Rewrite all frontmatter" action.
	 */
	async rewriteFrontmatterIfExists(title: HoardTitle): Promise<boolean> {
		const file = this.fileOf(title.id);
		if (!file) return false;
		const out = titleToProperties(title, this.getProgress(title), this.seasonsPending(title));
		const keep = new Set(this.index.invalidFields(title.id));
		if (!(TITLE_PROPS.watchedEpisodes in out)) {
			keep.add(TITLE_PROPS.watchedEpisodes);
			keep.add(TITLE_PROPS.skippedEpisodes);
			// derived from the unreadable watched text: 0% would be wrong
			if (!isSingleMovie(title.seasons, title.totalEpisodes)) keep.add(TITLE_PROPS.progress);
		}
		return this.processFrontMatter(file, title, (raw) => rewriteOwnedKeys(raw, TITLE_KEYS, out, keep));
	}

	// Note I/O

	private fileOf(id: string): TFile | null {
		return this.entryNotes.fileOf(id);
	}

	/**
	 * processFrontMatter, then the optimistic index update for `t` — inside the callback, so it lands
	 * before the write's `changed` event can be seen. False (and a notice) on unreadable YAML.
	 * `background` marks an automatic fill (no user write).
	 */
	private async processFrontMatter(
		file: TFile,
		t: HoardTitle,
		fn: (fm: Record<string, unknown>) => void,
		background = false,
	): Promise<boolean> {
		return this.entryNotes.updateProperties(file, (fm: Record<string, unknown>) => {
			fn(fm);
			this.afterWrite(t, { ...fm }, background);
		});
	}

	/** Creates the note for a new title; the title's id becomes the note path. */
	private async createNote(title: HoardTitle): Promise<void> {
		pinSeasonsWithoutIdentity(title);
		const { path, id } = await this.entryNotes.reserve('title', title.title, title.type);
		const fm = titleToProperties(title, this.getProgress(title), this.seasonsPending(title));
		const notes = title.notes ?? '';
		title.id = id;
		this.notes.set(title.id, notes);
		// index first, so the create event finds nothing new
		this.afterWrite(title, fm);
		try {
			await this.entryNotes.create(path, `---\n${stringifyYaml(fm)}---\n\n## Notes\n\n${notes}\n`);
		} catch (e) {
			this.index.removeLocal(title.id);
			this.views.delete(title.id);
			throw e;
		}
	}

	/** What the write pipeline needs to know about a title. */
	private readonly writeHooks: EntryWriteHooks<HoardTitle> = {
		baselineOf: (t) => this.baselineOf(t),
		movedPath: (src, t) => (t.title !== src.title || t.type !== src.type ? this.entryNotes.pathFor('title', t.title, t.type) : null),
		moveId: (from, to) => this.moveId(from, to),
		prepare: (t, src) => {
			// edited seasons belong in the note, so they reach other devices (the cache stays per device)
			const seasonList = (x: HoardTitle): string[] => x.seasons.map((s) => `${s.name}: ${s.episodes}`);
			if (src && t.seasons.length > 0 && !sameJson(seasonList(src), seasonList(t))) t.seasonsOverride = true;
			const pending = this.seasonsPending(t);
			return (x) => titleToProperties(x, this.getProgress(x), pending);
		},
		afterWrite: (t, fm) => this.afterWrite(t, fm),
		isLiveCopy: (t) => this.views.get(t.id)?.view === t,
		// nothing for the note; API data may still have changed. Without a slot there is no live copy to replace
		unchanged: (t) => {
			if (!this.basedOnStored(t)) return;
			this.syncCache(t);
			const slot = this.views.get(t.id);
			if (slot) slot.view = t;
		},
		create: (t) => this.createNote(t),
	};

	/**
	 * Writes a title to its note through the shared pipeline (`writeEntry`), then the `## Notes` body
	 * when the copy changed it. A note that was just created already holds its body; one that could
	 * not be read is left alone altogether.
	 */
	private async writeTitle(t: HoardTitle): Promise<void> {
		const outcome = await this.entryNotes.write(this.writeHooks, t);
		if (outcome === 'created' || outcome === 'unreadable') return;
		await this.writeNotesBody(t);
	}

	/**
	 * The body follows the same rule as the frontmatter: a copy only writes what it changed itself,
	 * so a stale copy cannot undo an edit that arrived from another device meanwhile.
	 */
	private async writeNotesBody(t: HoardTitle): Promise<void> {
		const notes = t.notes;
		if (typeof notes !== 'string') return;
		const current = this.notes.get(t.id) ?? '';
		const file = this.fileOf(t.id);
		if (file && notes !== (getNotesBaseline(t) ?? current) && notes !== current) {
			// set first: the modify event of this write then sees no change
			this.notes.set(t.id, notes);
			await this.entryNotes.process(file, (content) => replaceNotesSection(content, notes));
		}
		setNotesBaseline(t, this.notes.get(t.id) ?? '');
	}

	/** Stored state a copy was made from; falls back to the current slot or index entry. */
	private baselineOf(t: HoardTitle): HoardTitle | undefined {
		const known = getBaseline(t) ?? this.views.get(t.id)?.src;
		if (known) return known;
		const indexed = this.index.get(t.id);
		return indexed?.kind === 'title' ? indexed.entry : undefined;
	}

	/** True when `t` was made from the stored state of its note (or nothing is stored yet). */
	private basedOnStored(t: HoardTitle): boolean {
		const current = this.index.get(t.id);
		if (current?.kind !== 'title') return true;
		const base = getBaseline(t) ?? this.views.get(t.id)?.src;
		return !!base && sameStoredState(base, current.entry);
	}

	/**
	 * Cache + optimistic index update after an own write. `t` becomes the UI's copy only when it was
	 * made from the stored state; a stale copy's fields and API data would hide what changed in between,
	 * so the next read builds a fresh copy instead.
	 */
	private afterWrite(t: HoardTitle, fm: Record<string, unknown>, background = false): void {
		const fresh = this.basedOnStored(t);
		if (fresh) this.syncCache(t);
		const stored = titleFromProperties(t.id, fm, this.local.getCache(t.id)).entry;
		this.index.applyLocal({ kind: 'title', entry: stored }, { background });
		if (!fresh) return;
		this.views.set(t.id, { src: stored, view: t });
		setBaseline(t, stored);
	}

	/**
	 * Stores the title's API-derived fields in data.json when they changed. Merges into the entry:
	 * what is no title field (apiCheck, airing) and refilled seasons the title does not carry stay.
	 */
	private syncCache(t: HoardTitle): void {
		const prev = this.local.getCache(t.id) ?? {};
		const next: EntryCache = { ...prev };
		for (const key of TITLE_CACHE_KEYS) delete next[key];
		Object.assign(next, titleToCache(t));
		if (!next.seasons && prev.seasons) next.seasons = prev.seasons;
		if (sameJson(next, prev)) return;
		this.local.data.cache[t.id] = next;
		this.local.queueSave();
	}

	private async deleteNote(id: string): Promise<void> {
		await this.entryNotes.trash(id);
		this.index.removeLocal(id);
		this.local.deleteCache(id);
		this.views.delete(id);
		this.notes.delete(id);
		this.dirty.delete(id);
		this.pendingMdTitleIds.delete(id);
		const collapsed = this.local.data.ui.collapsedSeasons;
		if (collapsed) delete collapsed[id];
		this.local.queueSave();
	}

	/** Re-keys everything held per id after a rename. */
	private moveId(from: string, to: string): void {
		if (from === to) return;
		this.local.renameCache(from, to);
		this.index.removeLocal(from);
		const notes = this.notes.get(from);
		if (notes !== undefined) {
			this.notes.delete(from);
			this.notes.set(to, notes);
		}
		const slot = this.views.get(from);
		this.views.delete(from);
		let pending = false;
		for (const set of [this.dirty, this.pendingMdTitleIds]) {
			if (set.delete(from)) {
				set.add(to);
				pending = true;
			}
		}
		// the copy with the pending edit follows, so the flush writes the renamed note
		if (pending && slot) this.views.set(to, retargetSlot(slot, to));
		const collapsed = this.local.data.ui.collapsedSeasons;
		if (collapsed?.[from]) {
			collapsed[to] = collapsed[from];
			delete collapsed[from];
		}
		this.local.queueSave();
	}

	private async readNotes(id: string): Promise<void> {
		const file = this.fileOf(id);
		if (!file) return;
		this.notes.set(id, extractNotes(await this.entryNotes.cachedRead(file)) ?? '');
	}

	/** Follows `## Notes` edits made outside the plugin. */
	private async refreshNotes(file: TAbstractFile): Promise<void> {
		if (!(file instanceof TFile)) return;
		const c = this.entryNotes.classify(file.path);
		if (c?.kind !== 'title') return;
		const next = extractNotes(await this.entryNotes.read(file)) ?? '';
		const prev = this.notes.get(c.id) ?? '';
		if (next === prev) return;
		this.notes.set(c.id, next);
		const slot = this.views.get(c.id);
		if (slot && slot.view.notes === prev) {
			slot.view.notes = next;
			setNotesBaseline(slot.view, next);
		}
		this.notifyListeners();
	}

	private onVaultRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFile)) return;
		const from = this.entryNotes.classify(oldPath)?.id;
		const to = this.entryNotes.classify(file.path)?.id;
		if (from === undefined || to === undefined || from === to || !this.notes.has(from)) return;
		this.moveId(from, to);
	}

	// Dashboard helpers

	getRecentlyWatched(count: number): HoardTitle[] {
		return this.getTitles()
			.filter((t) => t.watchedEpisodes.length > 0 || t.status === 'Completed')
			.sort((a, b) => b.dateModified.localeCompare(a.dateModified))
			.slice(0, count);
	}

	getRecentlyAdded(count: number): HoardTitle[] {
		return this.getTitles()
			.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
			.slice(0, count);
	}

	getCompletedCount(): number {
		return this.getTitles().filter((t) => t.status === 'Completed').length;
	}

	// ID generation

	/**
	 * Provisional id for a title being built in the UI. The real id is the note path, assigned when
	 * the note is created (addTitle rewrites `title.id` in place).
	 */
	generateId(title: string): string {
		const id = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const existing = this.getTitles().map((t) => t.id);
		if (!existing.includes(id)) return id;
		let counter = 2;
		while (existing.includes(`${id}-${counter}`)) {
			counter++;
		}
		return `${id}-${counter}`;
	}
}
