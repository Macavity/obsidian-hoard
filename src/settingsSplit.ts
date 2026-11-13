import { DEFAULT_SETTINGS, LAST_USED_TYPE_SENTINEL, normalizeRowsLayout } from './types';
import type { HoardPluginSettings } from './types';
import { SHARED_SETTING_KEYS } from './storage/SharedConfigStore';
import type { SharedConfigStore } from './storage/SharedConfigStore';
import type { LocalStore } from './storage/LocalStore';
import { SECRET_KEYS } from './storage/SecretStore';
import type { SecretStore, SecretValues } from './storage/SecretStore';

/** Settings that no longer exist; dropped from stored data. */
const REMOVED_KEYS = ['rootFolder', 'customListsFolder'];

/** The base is synced: a secret key found there is never trusted. */
function withoutSecrets(shared: Record<string, unknown>): Record<string, unknown> {
	const out = { ...shared };
	for (const k of SECRET_KEYS) delete out[k];
	return out;
}

/**
 * Settings = DEFAULT_SETTINGS <- local (data.json) <- secrets <- shared (base); shared keys win,
 * except secret keys, which never come from the base.
 * Inputs and defaults are cloned: the result shares no list or record with the stores or with
 * DEFAULT_SETTINGS, so an edit in place changes neither, and `persistSettings` can see it.
 */
export function composeSettings(
	local: Record<string, unknown>,
	shared: Record<string, unknown>,
	secrets: SecretValues = {},
): HoardPluginSettings {
	const saved = structuredClone({ ...local, ...secrets, ...withoutSecrets(shared) }) as Partial<HoardPluginSettings>;
	for (const k of REMOVED_KEYS) delete (saved as Record<string, unknown>)[k];
	const defaults = structuredClone(DEFAULT_SETTINGS);
	const settings: HoardPluginSettings = Object.assign({}, defaults, saved);
	if (saved.listFilters) {
		settings.listFilters = Object.assign(
			{},
			defaults.listFilters,
			saved.listFilters,
		);
	}
	// per-tab merge so a partially saved record keeps defaults for the rest
	settings.cardTextStyles = Object.assign(
		{},
		defaults.cardTextStyles,
		saved.cardTextStyles ?? {},
	);
	if (settings.animeApiSource === undefined) {
		settings.animeApiSource = 'jikan';
	}
	// date display format. Existing installs saw DD/MM/YYYY everywhere, so 'european' is both the
	// default and the migration target for a missing or hand-edited value. Storage is unaffected.
	if (
		settings.dateFormat !== 'european' &&
		settings.dateFormat !== 'american' &&
		settings.dateFormat !== 'iso'
	) {
		settings.dateFormat = 'european';
	}
	if (settings.typeApiMapping === undefined) {
		settings.typeApiMapping = {};
	}
	// reading type badge colors (Manga / Book) — backfill defaults for old installs
	if (!settings.readingTypeColors) {
		settings.readingTypeColors = { manga: '#D4537E', book: '#D85A30' };
	} else {
		if (!settings.readingTypeColors.manga) settings.readingTypeColors.manga = '#D4537E';
		if (!settings.readingTypeColors.book) settings.readingTypeColors.book = '#D85A30';
	}
	// watchlist view: 'rows' is the default, and the removed 'cards' view migrates to 'rows'
	if (settings.defaultWatchlistView !== 'list' && settings.defaultWatchlistView !== 'rows') {
		settings.defaultWatchlistView = 'rows';
	}
	// backfill the status-bar Upcoming counter toggle for existing installs (default ON)
	if (settings.showUpcomingStatusBar === undefined) {
		settings.showUpcomingStatusBar = true;
	}
	// normalize the stored rows layout (drops unknown ids, appends shelves missing from an older layout)
	settings.rowsLayout = normalizeRowsLayout(settings.rowsLayout);
	// backfill the default Add type setting for existing installs
	if (settings.defaultAddType === undefined) {
		settings.defaultAddType = LAST_USED_TYPE_SENTINEL;
	}
	if (settings.lastAddedType === undefined) {
		settings.lastAddedType = '';
	}
	// array fields are never undefined after a partial merge
	if (!settings.types?.length) settings.types = defaults.types;
	if (!settings.statuses?.length) settings.statuses = defaults.statuses;
	if (!settings.reviews?.length) settings.reviews = defaults.reviews;
	if (!settings.priorities?.length) settings.priorities = defaults.priorities;
	if (!settings.seasonPalette?.length) settings.seasonPalette = defaults.seasonPalette;
	// the rating system must always be exactly five well-formed tiers; a missing or malformed value
	// (older or hand-edited data) resets to defaults
	if (
		!Array.isArray(settings.ratingSystem) ||
		settings.ratingSystem.length !== 5 ||
		settings.ratingSystem.some((t) => !t || typeof t.label !== 'string' || typeof t.color !== 'string')
	) {
		settings.ratingSystem = defaults.ratingSystem;
	}
	// migrate the Plan to watch colour from old grey to new teal
	const ptw = settings.statuses.find((s) => s.name === 'Plan to watch');
	if (ptw && ptw.color === '#888780') ptw.color = '#00A9A5';

	// ensure the "To be released" status exists (migration for existing users)
	if (!settings.statuses.find((s) => s.name === 'To be released')) {
		const completedIdx = settings.statuses.findIndex((s) => s.name === 'Completed');
		const insertAt = completedIdx >= 0 ? completedIdx + 1 : settings.statuses.length;
		settings.statuses.splice(insertAt, 0, { name: 'To be released', color: '#E8873A' });
	}

	return settings;
}

/**
 * Shared keys go to the base (whitelist-filtered there), the rest, including every API key,
 * to data.json; with a secret store the API keys go there instead. Secrets must never reach the base.
 */
export async function persistSettings(
	settings: HoardPluginSettings,
	local: LocalStore,
	shared: SharedConfigStore,
	secrets?: SecretStore,
): Promise<void> {
	const all = settings as unknown as Record<string, unknown>;
	const localPart: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(all)) {
		if (SHARED_SETTING_KEYS.includes(k)) continue;
		if (secrets && (SECRET_KEYS as readonly string[]).includes(k)) continue;
		localPart[k] = v;
	}
	if (secrets) {
		const values: SecretValues = {};
		for (const k of SECRET_KEYS) values[k] = settings[k] ?? '';
		// a key the storage refused stays in data.json rather than being lost on the next load
		const failed = secrets.write(values);
		for (const k of failed) localPart[k] = values[k];
		if (SECRET_KEYS.some((k) => values[k] && !failed.includes(k))) local.markSecretsInStorage();
	}
	local.data.settings = localPart;
	local.queueSave();
	// only keys that differ from what the base (plus defaults) already yields; none: no write at all
	const baseline = composeSettings({}, shared.get().settings) as unknown as Record<string, unknown>;
	const changed = shared.diff(Object.fromEntries(
		Object.entries(all).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(baseline[k])),
	));
	await shared.update(changed);
}
