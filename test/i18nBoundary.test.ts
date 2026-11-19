import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

// Translated text must never reach note properties: the storage/data layer
// stays free of i18n imports.
const root = cwd();

const storageFiles = readdirSync(join(root, 'src/shared/storage'))
	.filter((f) => f.endsWith('.ts'))
	.map((f) => `src/shared/storage/${f}`);

// the WatchLog import writes notes; its UI texts live in the onboarding modal only
const importFiles = readdirSync(join(root, 'src/modules/import/services/watchlog'))
	.filter((f) => f.endsWith('.ts'))
	.map((f) => `src/modules/import/services/watchlog/${f}`);

// the domain model: shared helpers, each module's domain files, roles and public surface
const domainFiles = readdirSync(join(root, 'src/shared/domain'))
	.filter((f) => f.endsWith('.ts'))
	.map((f) => `src/shared/domain/${f}`);
const moduleFiles = readdirSync(join(root, 'src/modules')).flatMap((m) => {
	const dir = `src/modules/${m}/domain`;
	const domain = existsSync(join(root, dir))
		? readdirSync(join(root, dir)).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/${f}`)
		: [];
	const surface = [`src/modules/${m}/services/roles.ts`, `src/modules/${m}/exports.ts`].filter((f) => existsSync(join(root, f)));
	return [...domain, ...surface];
});

const files = [
	...storageFiles,
	...importFiles,
	...domainFiles,
	...moduleFiles,
	'src/modules/watchlist/services/DataManager.ts',
	'src/modules/reading/services/ReadingDataManager.ts',
	'src/modules/games/services/GameDataManager.ts',
	'src/shared/services/HistoryManager.ts',
	'src/modules/settings/services/settingsSplit.ts',
	'src/modules/backup/services/backup.ts',
	'src/modules/airtime/services/airtimeScheduler.ts',
];

describe('i18n import boundary', () => {
	it.each(files)('%s does not import i18n', (file) => {
		const offending = readFileSync(join(root, file), 'utf8')
			.split('\n')
			.filter((line) => /from\s+['"][^'"]*i18n/.test(line));
		expect(offending).toEqual([]);
	});
});
