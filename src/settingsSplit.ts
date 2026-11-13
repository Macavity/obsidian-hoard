import { normalizeSettings } from './settingsNormalize';
import type { HoardPluginSettings } from './types';
import { SHARED_SETTING_KEYS } from './storage/SharedConfigStore';
import type { SharedConfigStore } from './storage/SharedConfigStore';
import type { LocalStore } from './storage/LocalStore';
import { SECRET_KEYS } from './storage/SecretStore';
import type { SecretStore, SecretValues } from './storage/SecretStore';

/** The base is synced: a secret key found there is never trusted. */
function withoutSecrets(shared: Record<string, unknown>): Record<string, unknown> {
	const out = { ...shared };
	for (const k of SECRET_KEYS) delete out[k];
	return out;
}

/**
 * Settings = DEFAULT_SETTINGS <- local (data.json) <- secrets <- shared (base); shared keys win,
 * except secret keys, which never come from the base. The merged record is a clone and is then
 * made valid key by key (`normalizeSettings`): the result shares no list or record with the stores
 * or with DEFAULT_SETTINGS, so an edit in place changes neither, and `persistSettings` can see it.
 */
export function composeSettings(
	local: Record<string, unknown>,
	shared: Record<string, unknown>,
	secrets: SecretValues = {},
): HoardPluginSettings {
	return normalizeSettings(structuredClone({ ...local, ...secrets, ...withoutSecrets(shared) }));
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
