import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/i18n';
import { actionLabel, formatDayHeader, titleFromEntry } from '../../src/LogTab';
import type { HistoryEntry } from '../../src/HistoryManager';

afterEach(() => {
	setLocale('en');
});

function entry(message: string): HistoryEntry {
	return { id: '1', timestamp: '2026-11-06T10:00:00.000Z', message };
}

describe('log tab status labels', () => {
	it('shows the stored watch status in the UI language', () => {
		setLocale('de');
		const label = actionLabel(entry('"Foo" status changed to Watching'));
		expect(label).toContain('Am Schauen');
		expect(label).not.toContain('Watching');
	});

	it('shows reading statuses and passes custom statuses through', () => {
		setLocale('de');
		expect(actionLabel(entry('"Bar" status changed to Plan to Read'))).toContain('Geplant');
		expect(actionLabel(entry('"Baz" status changed to My custom'))).toContain('My custom');
	});
});

describe('log tab game and library lines', () => {
	it('shows the stored game status in the UI language', () => {
		setLocale('de');
		const label = actionLabel(entry('Hades (Game) status changed to Playing'));
		expect(label).toContain('Am Spielen');
		expect(label).not.toContain('Playing');
	});

	it('shows the stored library type of a line in the UI language', () => {
		setLocale('de');
		expect(titleFromEntry(entry('Hades (Game) status changed to Playing'))).toBe('Hades (Spiel)');
		expect(titleFromEntry(entry('Dune (Book) At page 10 / 400'))).toBe('Dune (Buch)');
		expect(titleFromEntry(entry('Dark (TV Show) Rating → 4/5'))).toBe('Dark (Serie)');
		expect(titleFromEntry(entry('Foo (My type) was deleted'))).toBe('Foo (My type)');
	});
});

describe('log tab day header', () => {
	it('writes the German day with an ordinal dot', () => {
		setLocale('de');
		expect(formatDayHeader('2026-11-08')).toBe('Sonntag, 8. November 2026');
	});

	it('keeps the English day without a dot', () => {
		expect(formatDayHeader('2026-11-08')).toBe('Sunday, 8 November 2026');
	});
});
