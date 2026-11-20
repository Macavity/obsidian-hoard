import { describe, expect, it, vi } from 'vitest';
import { MaybeAddModal } from '../src/modules/airtime/ui/MaybeAddModal';
import { fakeSettings } from './helpers/fakeSettings';
import type { MaybeTitle } from '../src/modules/watchlist/domain/model';

describe('MaybeAddModal', () => {
	it('stores Source Type and Type as chosen, independently', async () => {
		const added: MaybeTitle[] = [];
		const store = { generateMaybeId: (n: string) => `m-${n}`, addMaybeTitle: vi.fn((e: MaybeTitle) => { added.push(e); return Promise.resolve(); }) };
		const settings = fakeSettings({ types: [{ name: 'Anime' }, { name: 'Korean TV Show' }] });
		const modal = new MaybeAddModal({} as never, settings as never, {} as never, store, { onAdded: () => {} });
		const m = modal as unknown as {
			selectedSourceType: string; selectedType: string; media: { title: string }; addMaybeTitle: () => Promise<void>;
		};
		expect(m.selectedType).toBe('Anime');
		m.selectedSourceType = 'Series';
		m.selectedType = 'Korean TV Show';
		m.media.title = 'Squid';
		await m.addMaybeTitle();
		expect(added[0]).toMatchObject({ type: 'Korean TV Show', sourceType: 'Series' });
	});
});
