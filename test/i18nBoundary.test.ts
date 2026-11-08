import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

// Translated text must never reach note properties: the storage/data layer
// stays free of i18n imports.
const root = cwd();

const storageFiles = readdirSync(join(root, 'src/storage'))
	.filter((f) => f.endsWith('.ts'))
	.map((f) => `src/storage/${f}`);

// the WatchLog import writes notes; its UI texts live in the onboarding modal only
const importFiles = readdirSync(join(root, 'src/import/watchlog'))
	.filter((f) => f.endsWith('.ts'))
	.map((f) => `src/import/watchlog/${f}`);

const files = [
	...storageFiles,
	...importFiles,
	'src/types.ts',
	'src/DataManager.ts',
	'src/ReadingDataManager.ts',
	'src/GameDataManager.ts',
	'src/HistoryManager.ts',
	'src/settingsSplit.ts',
	'src/backup.ts',
	'src/airtimeScheduler.ts',
];

describe('i18n import boundary', () => {
	it.each(files)('%s does not import i18n', (file) => {
		const offending = readFileSync(join(root, file), 'utf8')
			.split('\n')
			.filter((line) => /from\s+['"][^'"]*i18n/.test(line));
		expect(offending).toEqual([]);
	});
});
