import { Notice } from 'obsidian';
import type { DataManager } from '../services/DataManager';
import type { SettingsReader } from '../../settings/exports';
import type { AnimeSearchResult, HoardTitle } from '../domain/model';
import { formatVoteCount, getCommunityRating } from '../domain/titleHelpers';
import { getApiGroupForType } from '../../../shared/api/apiGroup';
import { apiErrorMessage, type ApiService } from '../../../shared/api/ApiService';
import { t } from '../../../shared/i18n';
import { createIconButton } from '../../../design-system/IconButton';

/** The title store the community-rating helpers read and write. */
export type CommunityRatingStore = Pick<DataManager, 'getTitle' | 'updateTitle' | 'updateCommunityRating'>;
/** The API methods the community-rating helpers call. */
export type CommunityRatingApi = Pick<ApiService, 'fetchCommunityRating' | 'searchAniList' | 'searchAnime'>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Per-source badge class; spelled out so every class name appears literally. */
const SOURCE_CLASSES: Record<string, string> = {
	imdb: 'hoard-community-rating__source--imdb',
	mal: 'hoard-community-rating__source--mal',
	anilist: 'hoard-community-rating__source--anilist',
	tmdb: 'hoard-community-rating__source--tmdb',
};

const SOURCE_LABELS: Record<string, string> = {
	imdb: 'IMDb',
	mal: 'MAL',
	anilist: 'AniList',
	tmdb: 'TMDB',
};

function formatScore(rating: number, source: string): string {
	if (source === 'anilist') return `${Math.round(rating)}%`;
	return rating.toFixed(rating >= 10 ? 0 : 1);
}

export function renderCommunityRating(
	parent: HTMLElement,
	titles: CommunityRatingStore,
	settings: SettingsReader,
	api: CommunityRatingApi,
	titleId: string,
	onUpdated?: () => void,
): void {
	const title = titles.getTitle(titleId);
	if (!title) return;

	parent.createSpan({ cls: 'hoard-star-rating__divider' });

	const badge = parent.createDiv({ cls: 'hoard-community-rating__badge' });
	const community = getCommunityRating(title);
	const hasRating = !!community.source && (community.rating ?? 0) > 0;

	if (hasRating) {
		const source = community.source ?? '';
		const label = SOURCE_LABELS[source] ?? source.toUpperCase();
		badge.createSpan({
			cls: `hoard-community-rating__source ${SOURCE_CLASSES[source] ?? ''}`.trimEnd(),
			text: label,
		});
		badge.createSpan({
			cls: 'hoard-community-rating__score',
			text: formatScore(community.rating ?? 0, source),
		});
		if ((community.votes ?? 0) > 0) {
			badge.createSpan({
				cls: 'hoard-community-rating__votes',
				text: `(${formatVoteCount(community.votes ?? 0)})`,
			});
		}
	} else {
		badge.createSpan({ cls: 'hoard-community-rating__empty', text: t('detail.community.empty') });
	}

	const refreshBtn = createIconButton(badge, {
		icon: 'refresh-cw',
		label: t('detail.community.refresh'),
		variant: 'framed',
		cls: 'hoard-community-rating__refresh',
	});
	refreshBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		void refreshCommunityRating(titles, settings, api, titleId, refreshBtn, true).then(() => {
			if (onUpdated) onUpdated();
		});
	});
}

/**
 * Auto-refresh: fetches in the background when data is stale (≥30 days) or never fetched. For anime,
 * only uses the API matching animeApiSource AND already holding an ID on the title — no
 * search-by-name in the background. Non-anime uses the standard fetchCommunityRating routing.
 */
const pendingRatingRefreshes: Set<string> = new Set();

export function maybeAutoRefreshCommunityRating(
	titles: CommunityRatingStore,
	settings: SettingsReader,
	api: CommunityRatingApi,
	titleId: string,
	onUpdated?: () => void,
): void {
	const title = titles.getTitle(titleId);
	if (!title) return;
	const last = title.communityRatingLastFetched ?? '';
	if (last) {
		const ts = Date.parse(last);
		if (!isNaN(ts) && Date.now() - ts < THIRTY_DAYS_MS) return;
	}
	if (!hasFetchableSource(title, settings.get().animeApiSource ?? 'jikan', settings.get().typeApiMapping)) return;
	if (pendingRatingRefreshes.has(titleId)) return;
	pendingRatingRefreshes.add(titleId);
	void (async () => {
		try {
			const ok = await backgroundRefresh(titles, settings, api, titleId);
			if (ok && onUpdated) onUpdated();
		} finally {
			pendingRatingRefreshes.delete(titleId);
		}
	})();
}

function hasFetchableSource(
	title: HoardTitle,
	animeApiSource: 'jikan' | 'anilist',
	mapping: Record<string, 'anime' | 'movie' | ''> | undefined,
): boolean {
	const group = getApiGroupForType(title.type, mapping);
	if (group === '') return false;
	if (group === 'anime') {
		if (animeApiSource === 'anilist') return (title.anilistId ?? 0) > 0;
		return (title.malId ?? 0) > 0;
	}
	return !!(title.externalLink ?? '').match(/tt\d+/);
}

async function backgroundRefresh(
	titles: CommunityRatingStore,
	settings: SettingsReader,
	api: CommunityRatingApi,
	titleId: string,
): Promise<boolean> {
	const title = titles.getTitle(titleId);
	if (!title) return false;
	const animeSource = settings.get().animeApiSource ?? 'jikan';
	const group = getApiGroupForType(title.type, settings.get().typeApiMapping);
	const result = await api.fetchCommunityRating(title, animeSource, group);
	if (!result) return false;
	titles.updateCommunityRating(titleId, result.rating, result.votes, result.source);
	return true;
}

/**
 * Manual refresh. Anime: respects animeApiSource; if the title lacks that source's ID it searches by
 * name there and, on a reasonable match, stores the new ID and updates externalLink. Non-anime:
 * standard fetchCommunityRating. Saves via updateTitle when IDs/externalLink change, otherwise the
 * lighter updateCommunityRating path.
 */
export async function refreshCommunityRating(
	titles: CommunityRatingStore,
	settings: SettingsReader,
	api: CommunityRatingApi,
	titleId: string,
	btnEl: HTMLElement | null,
	showNotice: boolean,
): Promise<boolean> {
	let title = titles.getTitle(titleId);
	if (!title) return false;
	if (btnEl) btnEl.addClass('is-loading');
	try {
		const animeSource = settings.get().animeApiSource ?? 'jikan';
		const group = getApiGroupForType(title.type, settings.get().typeApiMapping);

		if (group === '') {
			if (showNotice) {
				new Notice(t('detail.community.noApi', { type: title.type }));
			}
			return false;
		}

		if (group === 'anime') {
			const wantsAniList = animeSource === 'anilist';
			const hasPreferredId = wantsAniList
				? (title.anilistId ?? 0) > 0
				: (title.malId ?? 0) > 0;

			if (!hasPreferredId) {
				// search by name on the preferred API
				const matched = await searchForMatch(api, title, wantsAniList);
				if (!matched) {
					if (showNotice) {
						new Notice(t('detail.community.noMatch', { source: wantsAniList ? 'AniList' : 'MAL' }));
					}
					return false;
				}
				// persist the new ID + externalLink before fetching the rating
				const fresh = titles.getTitle(titleId);
				if (!fresh) return false;
				if (wantsAniList) {
					fresh.anilistId = matched.anilistId ?? 0;
					fresh.externalLink = `https://anilist.co/anime/${fresh.anilistId}`;
				} else {
					fresh.malId = matched.malId;
					fresh.externalLink = `https://myanimelist.net/anime/${fresh.malId}`;
				}
				await titles.updateTitle(fresh);
				title = fresh;
			} else {
				// we already have the right ID — still make externalLink match the preferred source
				const expectedLink = wantsAniList
					? `https://anilist.co/anime/${title.anilistId}`
					: `https://myanimelist.net/anime/${title.malId}`;
				if (title.externalLink !== expectedLink) {
					title.externalLink = expectedLink;
					await titles.updateTitle(title);
				}
			}
		}

		const result = await api.fetchCommunityRating(title, animeSource, group);
		if (!result) {
			if (showNotice) new Notice(t('detail.community.fetchFailed'));
			return false;
		}
		titles.updateCommunityRating(
			titleId,
			result.rating,
			result.votes,
			result.source,
		);
		if (showNotice) {
			const label = SOURCE_LABELS[result.source] ?? result.source;
			new Notice(t('detail.community.updated', { source: label }));
		}
		return true;
	} catch (err) {
		// the name-search step now throws instead of returning an empty list
		if (showNotice) new Notice(apiErrorMessage(err));
		return false;
	} finally {
		if (btnEl) btnEl.removeClass('is-loading');
	}
}

function normalizeName(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isReasonableMatch(needle: string, hay: string): boolean {
	const a = normalizeName(needle);
	const b = normalizeName(hay);
	if (!a || !b) return false;
	if (a === b) return true;
	if (a.includes(b) || b.includes(a)) return true;
	const aWords = new Set(a.split(' ').filter((w) => w.length > 2));
	const bWords = new Set(b.split(' ').filter((w) => w.length > 2));
	if (aWords.size === 0 || bWords.size === 0) return false;
	let shared = 0;
	for (const w of aWords) if (bWords.has(w)) shared++;
	const minSize = Math.min(aWords.size, bWords.size);
	return shared / minSize >= 0.5;
}

async function searchForMatch(
	api: CommunityRatingApi,
	title: HoardTitle,
	wantsAniList: boolean,
): Promise<AnimeSearchResult | null> {
	const results = wantsAniList
		? await api.searchAniList(title.title)
		: await api.searchAnime(title.title);
	if (!results.length) return null;
	const top = results[0]!;
	if (isReasonableMatch(title.title, top.title)) return top;
	// try a few more results in case the first isn't the best
	for (let i = 1; i < Math.min(results.length, 5); i++) {
		if (isReasonableMatch(title.title, results[i]!.title)) return results[i]!;
	}
	return null;
}
