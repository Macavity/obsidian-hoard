import { describe, expect, it, vi } from 'vitest';
import { DraftsTab } from '../../src/DraftsTab';
import { qsa } from '../helpers/dom';

const FILES: Record<string, { tags: string[]; text: string | Error }> = {
	'Note A': { tags: ['#hoard'], text: 'intro\n#hoard Dune, Hades,  \n#hoard\nnothing here #other' },
	'Note B': { tags: ['#hoard'], text: '#hoard dune, ' + 'x'.repeat(101) },
	'Note C': { tags: ['#other'], text: '#hoard Ignored' },
	'Broken': { tags: ['#hoard'], text: new Error('unreadable') },
	'NoCache': { tags: [], text: '' },
};

function makePlugin(drafts: unknown = undefined) {
	const persisted: unknown[] = [];
	const plugin = {
		settings: { showHintBanners: false },
		app: {
			vault: {
				getMarkdownFiles: () => Object.keys(FILES).map((basename) => ({ basename })),
				cachedRead: (f: { basename: string }) => {
					const t = FILES[f.basename]!.text;
					return t instanceof Error ? Promise.reject(t) : Promise.resolve(t);
				},
			},
			metadataCache: {
				getFileCache: (f: { basename: string }) => (f.basename === 'NoCache' ? null : { tags: FILES[f.basename]!.tags.map((tag) => ({ tag })) }),
				on: vi.fn(() => ({})), offref: vi.fn(),
			},
		},
		dataManager: {
			getTitles: () => [{ title: 'Hades' }],
			getDrafts: () => drafts,
			setDrafts: (s: unknown) => { persisted.push(JSON.parse(JSON.stringify(s))); },
		},
		readingDataManager: { getBooks: () => [], getMangaList: () => [] },
		gameDataManager: { getGames: () => [] },
	};
	return { plugin, persisted };
}

type Priv = { scanVault: () => Promise<Array<{ titleKey: string; titleDisplay: string; sources: string[]; added: boolean }>>; persistState: { dismissed: string[]; added: string[]; firstSeen: Record<string, string>; titleDisplay: Record<string, string> } };

describe('DraftsTab vault scan', () => {
	it('collects titles after the tag, splits on commas and skips unreadable or overlong entries', async () => {
		const { plugin, persisted } = makePlugin();
		const tab = new DraftsTab(document.createElement('div'), plugin as never, {} as never, () => {});
		const p = tab as unknown as Priv;
		p.persistState.dismissed = ['hades'];
		p.persistState.added = ['dune'];
		const entries = await p.scanVault();
		expect(entries.map((e) => e.titleKey)).toEqual(['dune']);
		expect(entries[0]!.sources.sort()).toEqual(['Note A', 'Note B']);
		expect(entries[0]!.added).toBe(true);
		expect(p.persistState.firstSeen.dune).toBeTruthy();
		expect(p.persistState.titleDisplay.hades).toBe('Hades');
		expect(persisted).toHaveLength(1);
		// second scan: nothing new to record
		await p.scanVault();
		expect(persisted).toHaveLength(1);
	});

	it('counts pending drafts without touching state', async () => {
		const { plugin } = makePlugin({ dismissed: [], added: ['dune'], titleDisplay: {}, firstSeen: {} });
		// Hades exists in the Watchlist, Dune is marked added, so nothing is pending
		expect(await DraftsTab.computePendingCount(plugin as never, {} as never)).toBe(0);
		const fresh = makePlugin(undefined);
		expect(await DraftsTab.computePendingCount(fresh.plugin as never, {} as never)).toBe(1);
		const dismissed = makePlugin({ dismissed: ['dune'], added: [], titleDisplay: { hades: 'Hades' }, firstSeen: {} });
		expect(await DraftsTab.computePendingCount(dismissed.plugin as never, {} as never)).toBe(0);
	});
});

describe('DraftsTab dismiss button', () => {
	it('is an x icon button that dismisses the draft', () => {
		const { plugin } = makePlugin();
		const root = document.createElement('div');
		const tab = new DraftsTab(root, plugin as never, {} as never, () => {});
		const dismiss = vi.spyOn(tab as unknown as { dismissEntry: (k: string) => void }, 'dismissEntry').mockImplementation(() => {});
		(tab as unknown as { renderUI: (e: unknown[]) => void }).renderUI([
			{ titleKey: 'new one', titleDisplay: 'New One', sources: ['Note'], firstSeen: '2026-01-01', added: false },
		]);
		const btn = qsa<HTMLButtonElement>(root, 'button.hoard-drafts__dismiss')[0]!;
		expect(btn.classList.contains('hoard-icon-btn')).toBe(true);
		expect(btn.getAttribute('data-icon')).toBe('x');
		btn.click();
		expect(dismiss).toHaveBeenCalledWith('new one');
	});
});
