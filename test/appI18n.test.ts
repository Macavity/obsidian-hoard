import { afterEach, describe, expect, it } from 'vitest';
import { setMockLanguage } from './__mocks__/obsidian';
import { getLocale, setLocale, t } from '../src/i18n';
import deApp from '../src/i18n/de/app';
import { HoardView } from '../src/HoardView';

afterEach(() => {
	setMockLanguage('en');
	setLocale('en');
});

describe('plugin shell i18n', () => {
	it('translates command names', () => {
		expect(t('app.commands.openPanel')).toBe('Open panel');
		setLocale('de');
		expect(t('app.commands.openPanel')).toBe(deApp.commands.openPanel);
		expect(deApp.commands.openPanel).not.toBe('Open panel');
	});

	it('translates the view title', () => {
		setLocale('de');
		const view = new HoardView({} as never, {} as never, {} as never);
		expect(view.getDisplayText()).toBe(deApp.viewTitle);
	});

	it('translates tab labels', () => {
		setLocale('de');
		expect(t('app.tabs.reading')).toBe(deApp.tabs.reading);
		expect(deApp.tabs.reading).not.toBe('Reading');
	});

	it('follows the Obsidian language on load', async () => {
		setMockLanguage('de');
		const { default: Plugin } = await import('../src/main');
		const plugin = Object.create(Plugin.prototype) as { onload(): Promise<void> };
		await plugin.onload().catch(() => undefined);
		expect(getLocale()).toBe('de');
	});
});
