import { readFileSync } from 'fs';
import { describe, it, expect, vi } from 'vitest';
import { classesInCss } from '../../scripts/lib/css-classes.mjs';
import { stylesheetFiles } from '../../scripts/check-css-classes.mjs';
import { openCardMenu, type CardMenuContext } from '../../src/design-system/PosterCard';

const MENU = '.hoard-card-menu';

function setup(): { container: HTMLElement; card: HTMLElement; btn: HTMLElement; ctx: CardMenuContext } {
	const container = document.body.createDiv();
	const card = container.createDiv({ cls: 'hoard-card' });
	const btn = card.createEl('button');
	return { container, card, btn, ctx: { container, cleanups: [] } };
}

describe('openCardMenu', () => {
	it('puts only styled classes on the menu and its items', () => {
		const { card, btn, ctx } = setup();
		openCardMenu(card, btn, [{ label: 'Edit', onClick: vi.fn() }], ctx);

		const styled = classesInCss(stylesheetFiles().map((p: string) => readFileSync(p, 'utf8')).join('\n'));
		const menu = card.querySelector<HTMLElement>(MENU);
		expect(menu).not.toBeNull();
		const used = [menu!, ...Array.from(menu!.children)].flatMap((el) => Array.from(el.classList));
		expect(used.filter((cls) => cls.startsWith('hoard-') && !styled.has(cls))).toEqual([]);
	});

	it('runs the clicked item with its card and closes the menu', () => {
		const { card, btn, ctx } = setup();
		const onClick = vi.fn();
		openCardMenu(card, btn, [{ label: 'Edit', onClick }], ctx);

		(card.querySelector(`${MENU}__item`) as HTMLElement).click();

		expect(onClick).toHaveBeenCalledWith(card);
		expect(card.querySelector(MENU)).toBeNull();
	});

	it('keeps a click on the menu itself away from the card', () => {
		const { card, btn, ctx } = setup();
		const onCard = vi.fn();
		card.addEventListener('click', onCard);
		openCardMenu(card, btn, [{ label: 'Edit', onClick: vi.fn() }], ctx);

		(card.querySelector(MENU) as HTMLElement).click();

		expect(onCard).not.toHaveBeenCalled();
		expect(card.querySelector(MENU)).not.toBeNull();
	});

	it('closes on a click outside, but not on the click that opened it or on its button', () => {
		vi.useFakeTimers();
		try {
			const { card, btn, ctx } = setup();
			openCardMenu(card, btn, [{ label: 'Edit', onClick: vi.fn() }], ctx);

			document.body.click(); // still the opening click: the dismiss listener registers after it
			expect(card.querySelector(MENU)).not.toBeNull();

			vi.runAllTimers();
			btn.click();
			expect(card.querySelector(MENU)).not.toBeNull();

			document.body.click();
			expect(card.querySelector(MENU)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps one menu open per container', () => {
		const { container, card, btn, ctx } = setup();
		const other = container.createDiv({ cls: 'hoard-card' });
		openCardMenu(card, btn, [{ label: 'Edit', onClick: vi.fn() }], ctx);
		openCardMenu(other, other.createEl('button'), [{ label: 'Edit', onClick: vi.fn() }], ctx);

		expect(container.querySelectorAll(MENU)).toHaveLength(1);
		expect(other.querySelector(MENU)).not.toBeNull();
	});
});
