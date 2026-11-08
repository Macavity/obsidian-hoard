import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/i18n';
import de from '../../src/i18n/de';
import { HoardSettingsTab } from '../../src/SettingsTab';
import { DEFAULT_SETTINGS } from '../../src/types';
import { tick } from '../helpers/common';

afterEach(() => setLocale('en'));

/** Text of every element plus its attribute values, so labels and aria-labels both count. */
function allText(el: Element): string[] {
	const own = Array.from(el.childNodes, (n) => (n.nodeType === Node.TEXT_NODE ? n.textContent ?? '' : '')).join('');
	const attrs = Array.from(el.attributes, (a) => a.value);
	return [own, ...attrs, ...Array.from(el.children).flatMap(allText)].filter(Boolean);
}

function makeTab(plugin: Record<string, unknown> = {}, section = 'general') {
	const full = {
		settings: { ...DEFAULT_SETTINGS },
		getLayout: () => ({ root: 'W' }),
		saveSettings: () => Promise.resolve(),
		...plugin,
	};
	const tab = new HoardSettingsTab({} as never, full as never);
	(tab as unknown as { activeSection: string }).activeSection = section;
	const root = tab.containerEl;
	// the tab renders through its own display(); the structural type sidesteps the base-class deprecation
	const render = (): void => (tab as { display(): void }).display();
	return { render, root };
}

describe('settings tab i18n', () => {
	it('renders group headings and setting names in German', () => {
		setLocale('de');
		const { render, root } = makeTab();
		render();
		const texts = allText(root);
		expect(texts).toContain(de.settings.group.main);
		expect(texts).toContain(de.settings.general.dateFormat.name);
		expect(de.settings.general.dateFormat.name).not.toBe('Date format');
	});

	it('shows the Steam bad-key failure in German', async () => {
		setLocale('de');
		const apiService = {
			resolveSteamId: () => Promise.resolve(''),
			setSteamCredentials: vi.fn(),
			checkSteamConnection: () => Promise.resolve({ ok: false, reason: 'badKey' }),
		};
		const { render, root } = makeTab({ apiService }, 'api');
		render();
		const steamTest = Array.from(root.querySelectorAll<HTMLElement>('.hoard-api-test')).at(-1)!;
		steamTest.click();
		await tick(20);
		expect(allText(root)).toContain(de.settings.steam.badKey);
	});
});
