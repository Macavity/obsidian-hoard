/** Grid of big option buttons used by the add choosers; each click closes the modal first. */
export function renderChoiceGrid<T extends string>(
	parent: HTMLElement,
	options: { label: string; choice: T }[],
	onPick: (choice: T) => void,
): void {
	const grid = parent.createDiv({ cls: 'hoard-draft-choice__grid' });
	for (const { label, choice } of options) {
		const btn = grid.createEl('button', { cls: 'hoard-draft-choice__btn' });
		btn.createDiv({ cls: 'hoard-draft-choice__label', text: label });
		btn.addEventListener('click', () => onPick(choice));
	}
}
