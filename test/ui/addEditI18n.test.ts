import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import de from '../../src/shared/i18n/de';
import { AddFromUrlModal } from '../../src/modules/watchlist/ui/AddFromUrlModal';
import { AddReadingModal } from '../../src/modules/reading/ui/AddReadingModal';
import { AddTitleChoiceModal } from '../../src/modules/watchlist/ui/AddTitleChoiceModal';
import { EditTitleModal } from '../../src/modules/watchlist/ui/EditTitleModal';
import { fakeSettings } from '../helpers/fakeSettings';

afterEach(() => setLocale('en'));

function allText(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll('*')).flatMap((e) => [
		e.textContent ?? '',
		...Array.from(e.attributes).map((a) => a.value),
	]).filter(Boolean);
}

describe('add and edit modals i18n', () => {
	it('renders the add title chooser in German', () => {
		setLocale('de');
		const modal = new AddTitleChoiceModal({} as never, { onChoice: () => {} });
		modal.onOpen();
		expect(modal.titleEl.textContent).toBe(de.add.choice.title);
		expect(modal.titleEl.textContent).not.toBe('Add title');
		const texts = allText(modal.contentEl);
		expect(texts).toContain(de.add.choice.fromUrl);
		expect(texts).toContain(de.add.choice.manual);
	});

	it('renders the add from URL modal in German', () => {
		setLocale('de');
		const modal = new AddFromUrlModal({ app: {} as never } as never, () => {});
		modal.onOpen();
		expect(modal.titleEl.textContent).toBe(de.add.choice.fromUrl);
		const texts = allText(modal.contentEl);
		expect(texts).toContain(de.add.url.info);
		expect(texts).toContain(de.common.add);
	});

	it('renders the edit title heading and buttons in German', () => {
		setLocale('de');
		const modal = new EditTitleModal(
			{} as never,
			fakeSettings({ types: [] }) as never,
			{ getGroups: () => [] } as never,
			{
				title: { id: 'x', title: 'Dune', type: 'Movie', totalEpisodes: 1, episodeDuration: 0, externalLink: '', seasons: [], posterUrl: '' } as never,
				onSaved: () => {},
			},
		);
		modal.onOpen();
		expect(modal.titleEl.textContent).toBe('Bearbeiten: Dune');
		const texts = allText(modal.contentEl);
		expect(texts).toContain(de.edit.saveChanges);
		expect(texts).toContain(de.common.cancel);
	});

	it('localizes the reading modal header title', () => {
		setLocale('de');
		const modal = new AddReadingModal({} as never, fakeSettings({}) as never, {} as never, {} as never, {} as never, (() => Promise.resolve([])), {} as never, {
			mode: 'book', onSaved: () => {}, initial: { state: {} as never, id: 'b1' },
		});
		expect((modal as unknown as { headerTitle: () => string }).headerTitle()).toBe(de.add.reading.editBook);
	});
});
