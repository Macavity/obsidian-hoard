import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform, WorkspaceLeaf } from 'obsidian';
import { HoardView } from '../../src/HoardView';

const { Stub } = vi.hoisted(() => ({
	Stub: class {
		render(): void {}
	},
}));

vi.mock('../../src/DashboardTab', () => ({ DashboardTab: Stub }));
vi.mock('../../src/ListTab', () => ({ ListTab: Stub }));
vi.mock('../../src/ReadingTab', () => ({ ReadingTab: Stub }));
vi.mock('../../src/GamesTab', () => ({ GamesTab: Stub }));
vi.mock('../../src/CustomListsTab', () => ({ CustomListsTab: Stub }));
vi.mock('../../src/LogTab', () => ({ LogTab: Stub }));
vi.mock('../../src/AirtimeTab', () => ({
	AirtimeTab: Object.assign(class extends Stub {}, { getAiredDueCount: () => 0, getMaybeDueCount: () => 0 }),
}));
vi.mock('../../src/DraftsTab', () => ({
	DraftsTab: Object.assign(class extends Stub {}, { computePendingCount: () => Promise.resolve(0) }),
}));

const PINNED = 'hoard-view__tab-content--pinned';
const HEIGHT_VAR = '--hoard-view-pinned-tab-height';

async function open(mobile: boolean) {
	(Platform as { isMobile: boolean }).isMobile = mobile;
	// the obsidian mock ignores registerDomEvent; the real one adds the listener
	vi.spyOn(HoardView.prototype as never, 'registerDomEvent').mockImplementation(((el: HTMLElement, type: string, cb: EventListener) => {
		el.addEventListener(type, cb);
	}) as never);
	const plugin = {
		settings: { colorTheme: 'default' },
		app: { metadataCache: { on: () => ({}) } },
		readingDataManager: {},
		gameDataManager: {},
	};
	const dm = { onChange: () => {}, offChange: () => {} };
	const view = new HoardView(new WorkspaceLeaf(), plugin as never, dm as never);
	document.body.appendChild(view.contentEl);
	await view.onOpen();
	const tabBar = view.contentEl.querySelector<HTMLElement>('.hoard-tab-bar')!;
	const tabContent = view.contentEl.querySelector<HTMLElement>('.hoard-view__tab-content')!;
	/** Fakes a layout pass: the view is `viewHeight` tall, the tab bar takes 40px of it. */
	const settle = (viewHeight: number): void => {
		Object.defineProperty(view.contentEl, 'clientHeight', { value: viewHeight, configurable: true });
		Object.defineProperty(tabBar, 'offsetHeight', { value: 40, configurable: true });
		view.refreshMobileLayout();
	};
	const height = (): string => tabContent.style.getPropertyValue(HEIGHT_VAR);
	const editor = (parent: HTMLElement, tag = 'input'): HTMLElement => {
		const el = parent.appendChild(document.createElement(tag));
		return el;
	};
	const focus = (el: HTMLElement): void => {
		el.focus();
		el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
	};
	return { view, tabBar, tabContent, settle, height, editor, focus };
}

beforeEach(() => { vi.useFakeTimers(); });

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	(Platform as { isMobile: boolean }).isMobile = false;
	document.body.empty();
});

describe('HoardView mobile tab height', () => {
	it('sizes the tab content to the view height minus the tab bar', async () => {
		const { tabContent, settle, height } = await open(true);
		settle(600);
		expect(height()).toBe('560px');
		expect(tabContent.classList.contains(PINNED)).toBe(true);
	});

	it('writes nothing while the view has no measured height', async () => {
		const { tabContent, settle, height } = await open(true);
		settle(0);
		expect(height()).toBe('');
		expect(tabContent.classList.contains(PINNED)).toBe(false);
	});

	it('writes nothing on desktop', async () => {
		const { tabContent, settle, height } = await open(false);
		settle(600);
		expect(height()).toBe('');
		expect(tabContent.classList.contains(PINNED)).toBe(false);
	});

	it('follows the view height when no editor has focus', async () => {
		const { settle, height } = await open(true);
		settle(300);
		settle(600);
		expect(height()).toBe('560px');
	});

	it('keeps the keyboard-shrunk height while an editor in the tab content has focus', async () => {
		const { tabContent, settle, height, editor, focus } = await open(true);
		settle(600);
		focus(editor(tabContent));
		settle(300);
		settle(600);
		expect(height()).toBe('260px');
	});

	it('treats a textarea as an editor', async () => {
		const { tabContent, settle, height, editor, focus } = await open(true);
		focus(editor(tabContent, 'textarea'));
		settle(300);
		settle(600);
		expect(height()).toBe('260px');
	});

	it('does not hold the height for focus outside the tab content', async () => {
		const { tabBar, settle, height, editor, focus } = await open(true);
		focus(editor(tabBar));
		settle(300);
		settle(600);
		expect(height()).toBe('560px');
	});

	it('does not hold the height for a focused element that is no editor', async () => {
		const { tabContent, settle, height, editor, focus } = await open(true);
		const button = editor(tabContent, 'button');
		focus(button);
		settle(300);
		settle(600);
		expect(height()).toBe('560px');
	});

	it('keeps the held height when focus moves from one editor to the next', async () => {
		const { tabContent, settle, height, editor, focus } = await open(true);
		const first = editor(tabContent);
		const second = editor(tabContent);
		focus(first);
		settle(300);
		first.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		focus(second);
		vi.advanceTimersByTime(300);
		settle(600);
		expect(height()).toBe('260px');
	});

	it('returns to the full height once focus has left every editor', async () => {
		const { tabContent, settle, height, editor, focus } = await open(true);
		const input = editor(tabContent);
		focus(input);
		settle(300);
		Object.defineProperty(tabContent.parentElement!, 'clientHeight', { value: 600, configurable: true });
		input.blur();
		input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		vi.advanceTimersByTime(300);
		expect(height()).toBe('560px');
	});

	it('returns to the full height when the focused editor is removed without a focusout', async () => {
		const { tabContent, settle, height, editor, focus } = await open(true);
		const input = editor(tabContent);
		focus(input);
		settle(300);
		input.remove();
		settle(600);
		expect(height()).toBe('560px');
	});
});
