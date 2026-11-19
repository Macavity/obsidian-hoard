import type { ReadingStatus } from '.';
import { DEFAULT_READING_STATUS_COLORS } from './readingDefaults';

/**
 * Badge colour for a reading status. The names are fixed, but the colours are user-editable
 * (Settings → Customize → Reading) and stored per name in `ReadingSettings.statusColors`; pass
 * that record in to honour the choice. Omitting it, or a missing key, falls back to the default.
 */
export function readingStatusColor(
	status: ReadingStatus,
	colors?: Record<string, string>,
): string {
	return colors?.[status] ?? DEFAULT_READING_STATUS_COLORS[status] ?? '#888780';
}
