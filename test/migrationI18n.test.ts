import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setMockLanguage } from './__mocks__/obsidian';
import { setLocale, t } from '../src/i18n';

beforeEach(() => {
	setMockLanguage('de');
	setLocale('de');
});

afterEach(() => {
	setMockLanguage('en');
	setLocale('en');
});

describe('migration notices (de)', () => {
	it('failure notice is German and keeps WatchLog', () => {
		const text = t('notices.migration.failed');
		expect(text).not.toBe('Hoard could not migrate the WatchLog data to notes. It will retry on the next start; see the developer console.');
		expect(text).toContain('WatchLog');
		expect(text).toContain('Entwicklerkonsole');
	});

	it('summary is German and keeps Hoard and WatchLog', () => {
		const text = t('notices.migration.summary', { done: 'X' });
		expect(text).toBe('Hoard hat von WatchLog migriert: X.');
	});

	it('settings of the adopted plugin is German', () => {
		expect(t('notices.migration.adoptedFrom', { from: 'watchlog-sync' })).toBe('Einstellungen von watchlog-sync');
	});

	it('settings block of a base move is German', () => {
		expect(t('notices.migration.settingsBlock', { to: 'Media/Hoard.base' })).toBe('Einstellungsblock in Media/Hoard.base');
	});

	it('data into notes is German', () => {
		expect(t('notices.migration.data', { created: 2, filled: 3, file: 'backup.json' }))
			.toBe('Daten in Notizen übernommen (2 erstellt, 3 ergänzt; Sicherung: backup.json)');
	});

	it('widget code blocks are German in singular and plural', () => {
		expect(t('notices.migration.widgets', { count: 1 })).toBe('Widget-Codeblock in 1 Notiz');
		expect(t('notices.migration.widgets', { count: 4 })).toBe('Widget-Codeblöcke in 4 Notizen');
	});

	it('skipped suffix is German in singular and plural', () => {
		expect(t('notices.migration.skipped', { count: 1 })).toBe('1 Eintrag wurde übersprungen, siehe die Entwicklerkonsole.');
		expect(t('notices.migration.skipped', { count: 3 })).toBe('3 Einträge wurden übersprungen, siehe die Entwicklerkonsole.');
	});
});

describe('migration notices (en)', () => {
	it('keeps the English texts', () => {
		setLocale('en');
		expect(t('notices.migration.summary', { done: 'X' })).toBe('Hoard migrated from WatchLog: X.');
		expect(t('notices.migration.widgets', { count: 1 })).toBe('widget code block in 1 note');
		expect(t('notices.migration.widgets', { count: 2 })).toBe('widget code blocks in 2 notes');
		expect(t('notices.migration.skipped', { count: 1 })).toBe('1 item was skipped, see the developer console.');
		expect(t('notices.migration.skipped', { count: 2 })).toBe('2 items were skipped, see the developer console.');
	});
});
