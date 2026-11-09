import { describe, expect, it } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { LocalStore } from '../../../src/storage/LocalStore';
import data from '../../fixtures/data-v1.json';
import { WATCHLOG_NOTES } from './setupSchema1';

describe('fresh start next to WatchLog data', () => {
	it('LocalStore ignores a schema-1 data.json and never overwrites it', async () => {
		const f = createFakeApp(WATCHLOG_NOTES);
		f.plugin.data = structuredClone(data);
		const local = new LocalStore(f.plugin);
		expect(await local.load()).toEqual({ schema: 'watchlog' });
		expect(local.data.settings).toEqual({});
		local.queueSave();
		await local.flush();
		expect(f.plugin.data).toEqual(data);
	});
});
