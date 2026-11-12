import { Platform, setIcon } from 'obsidian';

/** `base`, plus `mobile` on a mobile device: for a row whose phone layout is keyed on the row itself. */
export function mobileRowClass(base: string, mobile: string): string {
	return Platform.isMobile ? `${base} ${mobile}` : base;
}

/**
 * Marks the root of a detail modal. Theme variables are scoped to `.hoard-view` and
 * `.hoard-view[data-theme=…]`, so episode boxes, stars and progress bars need both on the content root.
 */
export function markDetailRoot(modalEl: HTMLElement, contentEl: HTMLElement, colorTheme: string | undefined): void {
	const theme = colorTheme ?? 'default';
	modalEl.setAttribute('data-theme', theme);
	contentEl.setAttribute('data-theme', theme);
	contentEl.addClass('hoard-view');
	contentEl.addClass('hoard-detail');
}

/** The heart button of a detail footer, centred by the footer's space-between; the caller paints and wires it. */
export function createFavoriteButton(footer: HTMLElement): HTMLButtonElement {
	const btn = footer.createEl('button', { cls: 'hoard-detail__favorite-btn', attr: { type: 'button' } });
	setIcon(btn, 'heart');
	return btn;
}
