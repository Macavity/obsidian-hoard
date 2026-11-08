import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { WatchLogOnboardingModal, type WatchLogImporter } from '../src/WatchLogOnboardingModal';
import type { ForkSource, OriginalSource } from '../src/import/watchlog/detect';

const app = {} as App;
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const find = (m: WatchLogOnboardingModal, action: string): HTMLElement | null =>
	m.contentEl.querySelector<HTMLElement>(`[data-action="${action}"]`);
function click(m: WatchLogOnboardingModal, action: string): void {
	const el = find(m, action);
	if (!el) throw new Error(`no ${action}`);
	el.click();
}
const counts = { titles: 1, books: 0, manga: 0, games: 0, lists: 0, notes: 1 };
const fork = { kind: 'fork', counts, pluginEnabled: false } as ForkSource;
const original = { kind: 'original', counts, pluginEnabled: true } as OriginalSource;

function fakeImporter(over: Partial<WatchLogImporter> = {}): WatchLogImporter & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		sources: { original: null, fork, hoardHasData: false },
		run: () => Promise.resolve({ created: 1, filled: 0, errors: [], review: [{ path: 'Hoard/Movie/Heat.md', reason: 'exists' as const, detail: '' }] }),
		plan: () => Promise.resolve([{ id: 'fork-notes' as const, paths: ['WatchLog/Movie/Heat.md'] }]),
		cleanup: (items) => { calls.push(`cleanup:${items.length}`); return Promise.resolve({ done: items.length, errors: [] }); },
		writeReport: () => Promise.resolve({ path: 'Hoard/r.md' } as TFile),
		decide: (k, d) => calls.push(`${k}:${d}`),
		openFile: (p) => calls.push(`open:${p}`),
		...over,
	};
}
const checked = (m: WatchLogOnboardingModal, kind: string): boolean =>
	m.contentEl.querySelector<HTMLInputElement>(`[data-source="${kind}"]`)!.checked;

describe('WatchLogOnboardingModal', () => {
	it('later stores nothing', async () => {
		const imp = fakeImporter();
		const m = new WatchLogOnboardingModal(app, imp); m.open();
		click(m, 'later');
		await m.finished;
		expect(imp.calls).toEqual([]);
	});
	it('decline stores declined for shown sources', () => {
		const imp = fakeImporter();
		const m = new WatchLogOnboardingModal(app, imp); m.open();
		click(m, 'decline');
		expect(imp.calls).toEqual(['fork:declined']);
	});
	it('escape is ignored while importing', async () => {
		let release!: () => void;
		const imp = fakeImporter({ run: () => new Promise((r) => { release = () => r({ created: 0, filled: 0, errors: [], review: [] }); }) });
		const m = new WatchLogOnboardingModal(app, imp); m.open();
		click(m, 'import');
		m.close();
		expect(m.step).toBe('import');
		release(); await flush();
		expect(m.step).toBe('result');
		expect(imp.calls).toContain('fork:imported');
	});
	it('backdrop click does not reach the modal close handler', () => {
		const m = new WatchLogOnboardingModal(app, fakeImporter()); m.open();
		let reached = false;
		m.containerEl.addEventListener('click', () => { reached = true; });
		m.containerEl.click();
		expect(reached).toBe(false);
	});
	it('review link opens file, cleanup runs only selected', async () => {
		const imp = fakeImporter();
		const m = new WatchLogOnboardingModal(app, imp); m.open();
		click(m, 'import'); await flush();
		click(m, 'review-link-0');
		expect(imp.calls).toContain('open:Hoard/Movie/Heat.md');
		click(m, 'next'); await flush();
		click(m, 'cleanup-run'); await flush();
		expect(imp.calls).toContain('cleanup:0');
		expect(m.step).toBe('done');
	});
	it('errors block cleanup for that source and offer retry', async () => {
		const imp = fakeImporter({ run: () => Promise.resolve({ created: 0, filled: 0, errors: ['boom'], review: [] }) });
		const m = new WatchLogOnboardingModal(app, imp); m.open();
		click(m, 'import'); await flush();
		expect(imp.calls).not.toContain('fork:imported');
		expect(find(m, 'retry')).not.toBeNull();
		expect(find(m, 'next')).toBeNull();
	});
	it('preselects fork, not original, when both exist', () => {
		const m = new WatchLogOnboardingModal(app, fakeImporter({ sources: { original, fork, hoardHasData: true } })); m.open();
		expect(checked(m, 'fork')).toBe(true);
		expect(checked(m, 'original')).toBe(false);
	});
	it('preselects original when it is the only source', () => {
		const m = new WatchLogOnboardingModal(app, fakeImporter({ sources: { original, fork: null, hoardHasData: false } })); m.open();
		expect(checked(m, 'original')).toBe(true);
	});
	it('import is disabled with nothing checked', () => {
		const m = new WatchLogOnboardingModal(app, fakeImporter()); m.open();
		const box = m.contentEl.querySelector<HTMLInputElement>('[data-source="fork"]')!;
		box.checked = false;
		box.dispatchEvent(new Event('change'));
		expect((find(m, 'import') as HTMLButtonElement).disabled).toBe(true);
	});
	it('startAt cleanup opens step 4', async () => {
		const m = new WatchLogOnboardingModal(app, fakeImporter(), { startAt: 'cleanup', imported: ['fork'] }); m.open();
		await flush();
		expect(m.step).toBe('cleanup');
		expect(m.contentEl.querySelector('[data-cleanup="fork-notes"]')).not.toBeNull();
		expect(m.contentEl.querySelector<HTMLInputElement>('[data-cleanup="fork-notes"]')!.checked).toBe(false);
	});
	it('cleanup runs the selected items, nothing to clean up shows message', async () => {
		const imp = fakeImporter();
		const m = new WatchLogOnboardingModal(app, imp, { startAt: 'cleanup', imported: ['fork'] }); m.open();
		await flush();
		const box = m.contentEl.querySelector<HTMLInputElement>('[data-cleanup="fork-notes"]')!;
		box.checked = true;
		box.dispatchEvent(new Event('change'));
		click(m, 'cleanup-run'); await flush();
		expect(imp.calls).toContain('cleanup:1');
		const empty = new WatchLogOnboardingModal(app, fakeImporter({ plan: () => Promise.resolve([]) }), { startAt: 'cleanup', imported: ['fork'] }); empty.open();
		await flush();
		expect(empty.contentEl.textContent).toContain('Nothing to clean up');
	});
	it('report button writes the report', async () => {
		const imp = fakeImporter();
		const m = new WatchLogOnboardingModal(app, imp); m.open();
		click(m, 'import'); await flush();
		click(m, 'report'); await flush();
		expect(m.contentEl.textContent).toContain('Hoard/r.md');
	});
});
