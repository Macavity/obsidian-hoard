// Drives the CSV import wizard (file pick → mapping → value map → preview → import) through its DOM.
import { vi } from 'vitest';
import type { Modal } from 'obsidian';
import { Notice } from 'obsidian';

/** Opens the modal and feeds `csv` through the file input; resolves once the mapping step is shown. */
export async function uploadCsv(modal: Modal, csv: string): Promise<void> {
	modal.open();
	const input = modal.contentEl.querySelector<HTMLInputElement>('.hoard-csv__file-input')!;
	Object.defineProperty(input, 'files', { value: [new File([csv], 'in.csv', { type: 'text/csv' })] });
	input.dispatchEvent(new Event('change'));
	await vi.waitFor(() => {
		if (!modal.contentEl.querySelector('.hoard-csv__preview-btn')) throw new Error('mapping step not shown');
	});
}

export function clickByText(root: HTMLElement, selector: string, text: string): void {
	const el = Array.from(root.querySelectorAll<HTMLElement>(selector)).find((e) => e.textContent === text);
	if (!el) throw new Error(`no ${selector} with text "${text}"`);
	el.click();
}

/** Mapping step → "Next". */
export function clickNext(modal: Modal): void {
	modal.contentEl.querySelector<HTMLElement>('.hoard-csv__preview-btn')!.click();
}

export function previewTitles(modal: Modal): string[] {
	return Array.from(modal.contentEl.querySelectorAll('.hoard-csv__row-title')).map((e) => e.textContent ?? '');
}

export function valueSelect(modal: Modal, index: number): HTMLSelectElement {
	return modal.contentEl.querySelectorAll<HTMLSelectElement>('.hoard-csv__value-map-select')[index]!;
}

/** Messages of every Notice raised so far (the obsidian mock records them). */
export const shownNotices = (Notice as unknown as { shown: string[] }).shown;
