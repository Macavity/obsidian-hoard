import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '../../src/i18n';
import de from '../../src/i18n/de';
import { ReadingCsvChoiceModal } from '../../src/ReadingCsvChoiceModal';
import { SteamSyncModal } from '../../src/SteamSyncModal';

afterEach(() => setLocale('en'));

function allText(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll('*')).map((e) => e.textContent ?? '').filter(Boolean);
}

describe('csv and steam i18n', () => {
	it('pluralizes the duplicate warning in German', () => {
		setLocale('de');
		expect(t('csv.duplicates', { count: 1 })).toBe(de.csv.duplicates.one.replace('{count}', '1'));
		expect(t('csv.duplicates', { count: 3 })).toBe(de.csv.duplicates.other.replace('{count}', '3'));
		expect(t('csv.duplicates', { count: 1 })).not.toBe(t('csv.duplicates', { count: 3 }));
		expect(t('csv.notice.exportedItems.book', { count: 2 })).toBe('2 Bücher exportiert.');
	});

	it('renders the reading CSV choice modal in German', () => {
		setLocale('de');
		const modal = new ReadingCsvChoiceModal({} as never, 'export', () => {});
		modal.onOpen();
		const texts = allText(modal.contentEl);
		expect(texts).toContain(de.csv.chooseExport);
		expect(texts).toContain(de.csv.library.book);
		expect(modal.titleEl.textContent).toBe(de.csv.exportTitle);
	});

	it('shows a German Steam failure message', async () => {
		setLocale('de');
		const modal = new SteamSyncModal({} as never, {
			settings: {},
			apiService: { getSteamOwnedGames: () => Promise.resolve({ ok: false, reason: 'empty' }) },
		} as never, {} as never);
		modal.onOpen();
		await new Promise((r) => setTimeout(r, 0));
		const texts = allText(modal.contentEl);
		expect(texts).toContain(de.steam.failure.empty);
		expect(texts).toContain(de.steam.title);
	});
});
