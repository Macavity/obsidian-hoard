import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import de from '../../src/shared/i18n/de';
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
});
