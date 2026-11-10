import { describe, it, expect } from 'vitest';
import { parse, stringify } from 'yaml';
import type { TFile } from 'obsidian';
import { createFakeApp } from './fakes/fakeApp';
import { SecretStore } from '../src/storage/SecretStore';
import { LocalStore } from '../src/storage/LocalStore';
import { SharedConfigStore } from '../src/storage/SharedConfigStore';
import { VaultLayout } from '../src/storage/VaultLayout';
import { composeSettings, persistSettings } from '../src/settingsSplit';

async function setup(files: Record<string, string>) {
	const f = createFakeApp(files);
	const local = new LocalStore(f.plugin);
	await local.load();
	const layout = new VaultLayout('W', () => []);
	const shared = new SharedConfigStore(f.app, () => layout, { parse, stringify });
	await shared.load();
	return { f, local, shared };
}

describe('settings split', () => {
	it('keeps secrets out of data.json and the base', async () => {
		const { f, local, shared } = await setup({ 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		const store = new SecretStore(f.app.secretStorage);
		const settings = composeSettings(local.data.settings, shared.get().settings, store.read());
		settings.tmdbApiKey = 'SECRET';
		settings.jikanBaseUrl = 'https://u:NASPW@jikan.example.org/v4';
		settings.statuses = [{ name: 'Rewatch', color: '#123456' }];
		await persistSettings(settings, local, shared, store);
		await local.flush();
		expect(f.files.get('W/Hoard.base')).toContain('Rewatch');
		expect(f.files.get('W/Hoard.base')).not.toContain('SECRET');
		expect(f.files.get('W/Hoard.base')).not.toContain('jikan.example.org');
		expect(JSON.stringify(local.data)).not.toMatch(/SECRET|NASPW/);
		expect(JSON.stringify(f.plugin.data)).not.toMatch(/SECRET|NASPW/);
		expect(JSON.stringify(f.plugin.data)).not.toContain('Rewatch');
		expect(f.secrets.get('hoard-tmdb-api-key')).toBe('SECRET');
		expect(local.data.secretsInStorage).toBe(true);
		expect(composeSettings(local.data.settings, shared.get().settings, store.read()).tmdbApiKey).toBe('SECRET');
	});

	it('never takes secret keys from the base', () => {
		const settings = composeSettings({}, { tmdbApiKey: 'FROM-BASE' }, { omdbApiKey: 'O' });
		expect(settings.tmdbApiKey).toBe('');
		expect(settings.omdbApiKey).toBe('O');
	});

	it('keeps colors and palettes local', async () => {
		const { f, local, shared } = await setup({ 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		const settings = composeSettings(local.data.settings, shared.get().settings);
		settings.seasonPalette = ['#ABCDEF'];
		settings.ratingSystem[0]!.label = 'Meh';
		settings.readingTypeColors = { manga: '#FEDCBA', book: '#000000' };
		await persistSettings(settings, local, shared);
		await local.flush();
		const base = f.files.get('W/Hoard.base')!;
		for (const k of ['ABCDEF', 'Meh', 'FEDCBA', 'ratingSystem']) expect(base).not.toContain(k);
		expect(JSON.stringify(f.plugin.data)).toContain('ABCDEF');
	});

	it('writes nothing when no shared key changed', async () => {
		const src = 'hoard:\n  version: 1\n  futureKey: 1\n';
		const { f, local, shared } = await setup({ 'W/Hoard.base': src });
		const settings = composeSettings(local.data.settings, shared.get().settings);
		settings.tmdbApiKey = 'K';
		await persistSettings(settings, local, shared);
		expect(f.files.get('W/Hoard.base')).toBe(src);
	});

	it('writes only the changed shared key', async () => {
		const { f, local, shared } = await setup({ 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		const settings = composeSettings(local.data.settings, shared.get().settings);
		settings.halfStarRatings = !settings.halfStarRatings;
		await persistSettings(settings, local, shared);
		const out = f.files.get('W/Hoard.base')!;
		expect(out).toContain('halfStarRatings');
		expect(out).not.toContain('statuses');
	});

	it('lets shared keys win over local and drops removed folder settings', async () => {
		const { local, shared } = await setup({
			'W/Hoard.base': 'hoard:\n  version: 1\n  statuses:\n    - name: Shared\n      color: "#111111"\n',
		});
		local.data.settings = { statuses: [{ name: 'Local', color: '#222222' }], rootFolder: 'X', tmdbApiKey: 'K' };
		const s = composeSettings(local.data.settings, shared.get().settings);
		expect(s.statuses.some((t) => t.name === 'Shared')).toBe(true);
		expect(s.tmdbApiKey).toBe('K');
		expect('rootFolder' in s).toBe(false);
	});

	it('picks up external base changes', async () => {
		const { f, local, shared } = await setup({ 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		shared.start();
		let changed = 0;
		shared.onChange(() => { changed++; });
		await f.app.vault.modify(f.app.vault.getAbstractFileByPath('W/Hoard.base') as TFile, 'hoard:\n  version: 1\n  statuses:\n    - name: Ext\n      color: "#333333"\n');
		await new Promise((r) => setTimeout(r, 50));
		expect(changed).toBe(1);
		expect(composeSettings(local.data.settings, shared.get().settings).statuses[0]?.name).toBe('Ext');
	});
});
