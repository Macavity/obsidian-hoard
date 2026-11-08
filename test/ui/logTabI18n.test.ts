import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '../../src/i18n';
import { actionLabel, formatDayHeader, titleFromEntry } from '../../src/LogTab';
import type { HistoryAction, HistoryEntry } from '../../src/HistoryManager';

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

describe('log tab action labels', () => {
	const label = (action: HistoryAction, message: string) => actionLabel({ ...entry(message), action });

	it('labels added, group and deleted lines', () => {
		expect(label('added', 'Dune (Book) was added')).toBe(t('dashboard.log.action.added'));
		expect(label('group', 'Group "Foo" was created')).toBe(t('dashboard.log.action.group'));
		expect(label('deleted', 'Foo (My type) was deleted')).toBe(t('dashboard.log.action.deleted'));
		expect(new Set([t('dashboard.log.action.added'), t('dashboard.log.action.group'), t('dashboard.log.action.deleted')]).size).toBe(3);
	});

	it('labels ratings with and without a value', () => {
		expect(label('rating', 'Dark (TV Show) Rating → 4/5')).toBe(t('dashboard.log.action.rating', { value: '4/5' }));
		expect(label('rating', 'Dark (TV Show) rating changed')).toBe(t('dashboard.log.action.ratingChanged'));
	});

	it('labels status lines with and without a match', () => {
		expect(label('status', '"Foo" status changed to Watching')).toBe(t('dashboard.log.action.status', { status: 'Watching' }));
		expect(label('status', '"Foo" status updated')).toBe(t('dashboard.log.action.statusChanged'));
	});

	it('labels completed lines', () => {
		expect(label('completed', '"Foo" was marked as watched')).toBe(t('dashboard.log.action.completed'));
	});

	it('labels reading progress by page, chapter and volume', () => {
		expect(label('watched', 'Dune (Book) At page 10 / 400')).toBe(t('dashboard.log.action.atPage', { n: '10', total: '400' }));
		expect(label('watched', 'Berserk (Manga) At chapter 3 / 364')).toBe(t('dashboard.log.action.atChapter', { n: '3', total: '364' }));
		expect(label('watched', 'Berserk (Manga) At volume 2 / 41')).toBe(t('dashboard.log.action.atVolume', { n: '2', total: '41' }));
	});

	it('labels watched seasons, episodes and generic watches', () => {
		expect(label('watched', 'Dark (TV Show) Season 2 was fully watched on 2026-11-06')).toBe(t('dashboard.log.action.seasonWatched', { name: 'Season 2' }));
		expect(label('watched', 'Dark (TV Show) S1E7 episode 7 watched')).toBe(t('dashboard.log.action.episodeWatched', { n: '7' }));
		expect(label('watched', 'Dark (TV Show) watched')).toBe(t('dashboard.log.action.watched'));
	});

	it('falls back to updated for an unknown action', () => {
		expect(label('other' as HistoryAction, 'Dark (TV Show) something')).toBe(t('dashboard.log.action.updated'));
	});
});
