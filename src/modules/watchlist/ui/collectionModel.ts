// Pure decisions of the collection modal: card models, defaults, id dedupe, notice text.

import { t } from '../../../shared/i18n';
import { getThemedColor } from '../../../shared/domain/tags';
import type { PosterCardSpec } from '../../../design-system/PosterCard';
import type { HoardPluginSettings } from '../../settings/exports';
import type { DeepReadonly } from '../../../shared/domain/deepReadonly';
import type { HoardTitle, TmdbCollectionPart } from '../domain/model';
import { getDisplayPoster } from '../domain/titles';

export type HoardSettings = DeepReadonly<HoardPluginSettings>;
export type CardSpecBase = Omit<PosterCardSpec, 'onClick'>;

export const NOT_ADDED_COLOR = '#4b5563';

function progressRatio(existing: HoardTitle, total: number): number | undefined {
	if (existing.status === 'Completed') return 1;
	if (total <= 0) return undefined;
	return Math.max(0, Math.min(1, existing.watchedEpisodes.length / total));
}

export function existingPartCard(
	existing: HoardTitle,
	settings: HoardSettings,
	effectiveTotal: number,
	fallbackPoster: string,
	year: string,
): CardSpecBase {
	const typeDef = settings.types.find((d) => d.name === existing.type);
	const statusDef = settings.statuses.find((d) => d.name === existing.status);
	const typeColor = typeDef
		? getThemedColor(existing.type, typeDef.color, settings.colorTheme)
		: NOT_ADDED_COLOR;
	return {
		dataset: { titleId: existing.id },
		title: existing.title,
		posterUrl: getDisplayPoster(existing) || fallbackPoster,
		placeholderColor: typeColor,
		statusLabel: existing.status,
		statusColor: statusDef
			? getThemedColor(existing.status, statusDef.color, settings.colorTheme)
			: undefined,
		typeLabel: existing.type,
		typeColor,
		year: year || undefined,
		progressRatio: progressRatio(existing, effectiveTotal),
	};
}

export function missingPartCard(
	part: TmdbCollectionPart,
	selected: boolean,
	movieType: string,
	fallbackPoster: string,
	year: string,
): CardSpecBase {
	return {
		dataset: { partId: String(part.id) },
		title: part.title ?? t('misc.collection.untitled'),
		posterUrl: fallbackPoster,
		placeholderColor: NOT_ADDED_COLOR,
		selected,
		statusLabel: t('misc.collection.notAdded'),
		statusColor: NOT_ADDED_COLOR,
		typeLabel: movieType,
		typeColor: NOT_ADDED_COLOR,
		year: year || undefined,
	};
}

/** Status and priority for added parts; the shipped defaults may have been renamed away. */
export function collectionDefaults(
	settings: Pick<HoardSettings, 'statuses' | 'priorities'>,
): { status: string; priority: string } {
	return {
		status:
			settings.statuses.find((s) => s.name === 'Plan to watch')?.name ??
			settings.statuses[0]?.name ??
			'Plan to watch',
		priority:
			settings.priorities?.find((p) => p.name === 'Medium')?.name ??
			settings.priorities?.[0]?.name ??
			'Medium',
	};
}

/** `base` when free, else `base-2`, `base-3`, … The caller records the result in `taken`. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

export function collectionAddNotice(added: number, failed: number, name: string): string {
	if (failed === 0) return t('misc.collection.added', { count: added, name });
	return added > 0 ? t('misc.collection.partial', { added, failed }) : t('misc.collection.fetchFailed');
}
