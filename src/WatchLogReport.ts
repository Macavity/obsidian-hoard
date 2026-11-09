import { t } from './i18n';
import type { WatchLogSourceKind } from './import/watchlog/detect';
import { generalErrors, type ImportReport, type ReviewItem } from './import/watchlog/report';

/** Product names, not translated. */
export const PLUGIN_NAME: Record<WatchLogSourceKind, string> = { original: 'WatchLog', fork: 'WatchLog Sync' };

export const REASONS = ['exists', 'kept-value', 'error'] as const;
const REASON_KEY = { exists: 'exists', 'kept-value': 'keptValue', error: 'error' } as const;

export const reasonLabel = (reason: ReviewItem['reason']): string => t(`onboarding.result.reasons.${REASON_KEY[reason]}`);

/** The translated detail of a review item; empty when the reason says it all. */
export const reviewDetail = (item: ReviewItem): string => (item.code ? t(`onboarding.details.${item.code}`, item.params) : '');

export function reportStats(r: ImportReport): string {
	return [
		t('onboarding.result.created', { count: r.created }),
		t('onboarding.result.filled', { count: r.filled }),
		t('onboarding.result.review', { count: r.review.length }),
		t('onboarding.result.errors', { count: r.errors.length }),
	].join(' · ');
}

/** A Markdown link that survives `[`, `]`, `(`, `)`, `#`, `|` and spaces in the path (a wikilink would not). */
function link(path: string): string {
	const label = path.replace(/[[\]\\]/g, (c) => `\\${c}`);
	const segment = (s: string): string => encodeURIComponent(s).replace(/\(/g, '%28').replace(/\)/g, '%29');
	return `[${label}](${path.split('/').map(segment).join('/')})`;
}

function section(kind: WatchLogSourceKind, r: ImportReport): string[] {
	const lines = [`## ${PLUGIN_NAME[kind]}`, '', reportStats(r), ''];
	for (const err of generalErrors(r)) lines.push(`- ${err}`);
	for (const reason of REASONS) {
		const items = r.review.filter((i) => i.reason === reason);
		if (!items.length) continue;
		lines.push(`### ${reasonLabel(reason)}`, '');
		for (const i of items) {
			const detail = reviewDetail(i);
			lines.push(detail ? `- ${link(i.path)} – ${detail}` : `- ${link(i.path)}`);
		}
		lines.push('');
	}
	return lines;
}

/** The import report as a note, in the UI language. */
export function reportMarkdown(reports: Partial<Record<WatchLogSourceKind, ImportReport>>): string {
	const body = (['original', 'fork'] as const).flatMap((k) => (reports[k] ? section(k, reports[k]) : []));
	return [`# ${t('onboarding.title')}`, '', ...body].join('\n');
}
