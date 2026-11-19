import { describe, it, expect, vi } from 'vitest';
import { HistoryManager } from '../src/shared/services/HistoryManager';
import type { HistoryStore } from '../src/shared/storage/HistoryStore';

const storeWith = (append: (e: unknown) => Promise<void>): HistoryStore => ({ append }) as unknown as HistoryStore;

describe('HistoryManager.log', () => {
	it('records the message with its metadata, newest first, and appends it to the store', async () => {
		const append = vi.fn(() => Promise.resolve());
		const manager = new HistoryManager(storeWith(append));

		await manager.log('first');
		await manager.log('Finished "Dune"', { source: 'Reading', action: 'completed', titleName: 'Dune', titleId: 'Books/Dune' });

		const [latest, earlier] = manager.getEntries();
		expect(latest).toMatchObject({ message: 'Finished "Dune"', source: 'Reading', action: 'completed', titleName: 'Dune', titleId: 'Books/Dune' });
		expect(earlier?.message).toBe('first');
		expect(latest?.id).toMatch(/#1$/);
		expect(append).toHaveBeenCalledTimes(2);
	});

	it('keeps the entry in memory when the store write fails', async () => {
		const manager = new HistoryManager(storeWith(() => Promise.reject(new Error('disk full'))));

		await manager.log('survives');

		expect(manager.getEntries().map((e) => e.message)).toEqual(['survives']);
	});

	it('works without a store and keeps only the newest 1000 entries', async () => {
		const manager = new HistoryManager();

		for (let i = 0; i < 1001; i++) await manager.log(`entry ${i}`);

		const entries = manager.getEntries();
		expect(entries).toHaveLength(1000);
		expect(entries[0]?.message).toBe('entry 1000');
		expect(entries.at(-1)?.message).toBe('entry 1');
	});
});
