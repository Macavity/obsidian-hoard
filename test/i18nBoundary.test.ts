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

// @types/node here has no readdirSync({ recursive }), so subfolders are walked explicitly.
function tsFilesUnder(dir: string): string[] {
	return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
		const rel = `${dir}/${e.name}`;
		if (e.isDirectory()) return tsFilesUnder(rel);
		return e.name.endsWith('.ts') ? [rel] : [];
	});
}

// Only the WatchLog migration's Notices are translated; the rest of src/migration stays i18n-free.
const migrationFiles = tsFilesUnder('src/migration').filter((f) => f !== 'src/migration/watchlog/index.ts');

const files = [
	...storageFiles,
	...migrationFiles,
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
