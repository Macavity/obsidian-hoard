import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import { ConfirmModal } from '../../src/shared/ui/ConfirmModal';

afterEach(() => {
	setLocale('en');
});

describe('misc modal i18n', () => {
	it('localizes the confirm button', () => {
		setLocale('de');
		const modal = new ConfirmModal({} as never, 'Eintrag entfernen?', () => {});
		modal.open();
		expect(modal.contentEl.querySelector('.hoard-btn--danger')?.textContent).toBe('Bestätigen');
	});
});
