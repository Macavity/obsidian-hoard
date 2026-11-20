import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import de from '../../src/shared/i18n/de';
import { newSettingsTab } from '../helpers/newSettingsTab';
import { DEFAULT_SETTINGS } from '../../src/modules/settings/domain/settingsDefaults';
import { tick } from '../helpers/common';
import { fakeSettings } from '../helpers/fakeSettings';

afterEach(() => setLocale('en'));

/** Text of every element plus its attribute values, so labels and aria-labels both count. */
function allText(el: Element): string[] {
	const own = Array.from(el.childNodes, (n) => (n.nodeType === Node.TEXT_NODE ? n.textContent ?? '' : '')).join('');
	const attrs = Array.from(el.attributes, (a) => a.value);
	return [own, ...attrs, ...Array.from(el.children).flatMap(allText)].filter(Boolean);
}

function makeTab(over: Record<string, unknown> = {}, section = 'general') {
	const fakes = {
		app: {},
		settings: fakeSettings({ ...DEFAULT_SETTINGS }),
		layout: () => ({ root: 'W' }),
		...over,
	};
	const tab = newSettingsTab(fakes);
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
		const api = {
			resolveSteamId: () => Promise.resolve(''),
			setSteamCredentials: vi.fn(),
			checkSteamConnection: () => Promise.resolve({ ok: false, reason: 'badKey' }),
		};
		const { render, root } = makeTab({ api }, 'api');
		render();
		const steamTest = Array.from(root.querySelectorAll<HTMLElement>('.hoard-api-provider__test')).at(-1)!;
		steamTest.click();
		await tick(20);
		expect(allText(root)).toContain(de.settings.steam.badKey);
	});
});
