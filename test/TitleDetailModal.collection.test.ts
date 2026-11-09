import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { TitleDetailModal } from '../src/TitleDetailModal';
import { DEFAULT_SETTINGS, type HoardTitle, type TmdbCollectionDetail } from '../src/types';
import { t } from '../src/i18n';
import { resolveCollection, countMissing } from '../src/CollectionModal';

vi.mock('../src/CollectionModal', () => ({
	resolveCollection: vi.fn(),
	countMissing: vi.fn(() => 0),
	CollectionModal: class { open(): void {} },
}));

const title = { id: 't1', title: 'Alien', type: 'Movie', seasons: [], watchedEpisodes: [] } as unknown as HoardTitle;
const collection = (parts: number): TmdbCollectionDetail =>
	({ id: 1, name: 'Alien Collection', parts: Array.from({ length: parts }, (_, i) => ({ id: i })) });

function build() {
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		dataManager: { getCollapsedSeasonsForTitle: () => new Set<number>(), getTitles: () => [title] },
	};
	const modal = new TitleDetailModal({} as never, plugin as never, title) as unknown as {
		maybeRenderCollectionButton: (host: HTMLElement) => Promise<void>;
	};
	const footer = document.createElement('div');
	footer.className = 'hoard-detail-footer';
	const host = footer.createDiv();
	document.body.appendChild(footer);
	return { modal, host, footer };
}

afterEach(() => {
	document.body.empty();
	(Platform as { isMobile: boolean }).isMobile = false;
	vi.mocked(countMissing).mockReturnValue(0);
});

describe('TitleDetailModal collection button', () => {
	it('stays silent when the lookup fails, finds nothing or a one-film collection', async () => {
		const { modal, host } = build();
		vi.mocked(resolveCollection).mockRejectedValueOnce(new Error('net'));
		await modal.maybeRenderCollectionButton(host);
		vi.mocked(resolveCollection).mockResolvedValueOnce(null);
		await modal.maybeRenderCollectionButton(host);
		vi.mocked(resolveCollection).mockResolvedValueOnce(collection(1));
		await modal.maybeRenderCollectionButton(host);
		expect(host.childElementCount).toBe(0);
	});

	it('skips a host that left the DOM mid-flight', async () => {
		const { modal, host, footer } = build();
		footer.remove();
		vi.mocked(resolveCollection).mockResolvedValueOnce(collection(3));
		await modal.maybeRenderCollectionButton(host);
		expect(host.childElementCount).toBe(0);
	});

	it('shows a complete collection', async () => {
		const { modal, host } = build();
		vi.mocked(resolveCollection).mockResolvedValueOnce(collection(3));
		await modal.maybeRenderCollectionButton(host);
		const btn = host.querySelector('button.hoard-collection-btn')!;
		expect(btn.classList.contains('has-missing')).toBe(false);
		expect(btn.textContent).toBe(t('detail.collection.label'));
		expect(btn.getAttribute('aria-label')).toBe(t('detail.collection.tipComplete', { name: 'Alien Collection' }));
	});

	it('flags missing films and parks the heart left on mobile', async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		vi.mocked(countMissing).mockReturnValue(2);
		const { modal, host, footer } = build();
		vi.mocked(resolveCollection).mockResolvedValueOnce(collection(3));
		await modal.maybeRenderCollectionButton(host);
		const btn = host.querySelector('button.hoard-collection-btn')!;
		expect(btn.classList.contains('has-missing')).toBe(true);
		expect(btn.textContent).toBe(t('detail.collection.missing', { count: 2 }));
		expect(footer.classList.contains('hoard-footer-heart-left')).toBe(true);
	});
});
