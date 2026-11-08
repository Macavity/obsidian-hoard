import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/i18n';
import { ConfirmModal } from '../../src/ConfirmModal';

afterEach(() => {
	setLocale('en');
});

describe('misc modal i18n', () => {
	it('localizes the confirm modal title and confirm button', () => {
		setLocale('de');
		const modal = new ConfirmModal({} as never, 'Eintrag entfernen?', () => {});
		modal.open();
		expect(modal.titleEl.textContent).toBe('Bist du sicher?');
		expect(modal.contentEl.querySelector('.hoard-btn-danger')?.textContent).toBe('Bestätigen');
	});
});
