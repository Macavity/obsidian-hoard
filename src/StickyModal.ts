// Pins a detail modal's action bar to the bottom while the body scrolls.

/** Must be a direct child of the modal's scrolling element. */
export function pinModalFooter(footer: HTMLElement | null | undefined): void {
	if (!footer) return;
	footer.addClass('hoard-sticky-bottom');
	// sticky can't leave the parent's content box, so the parent's padding-bottom would
	// show as a gap under the bar (mobile has one, desktop doesn't)
	footer.parentElement?.addClass('hoard-has-sticky-footer');
}
