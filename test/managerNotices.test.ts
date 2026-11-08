import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Notice } from 'obsidian';
import { setLocale, t } from '../src/i18n';
import { setupDataManager } from './helpers/setupDataManager';
import { tick } from './helpers/common';

const shown = (Notice as unknown as { shown: string[] }).shown;

describe('manager notices', () => {
	beforeEach(() => { shown.length = 0; });

	it('reports a blocked rename as a code, without text', async () => {
		const { dm, notices } = await setupDataManager({
			'W/Movie/A.md': '---\ntitle: A\ntype: Movie\n---\n',
			'W/Movie/B.md': '---\ntitle: B\ntype: Movie\n---\n',
		});
		await dm.updateTitle({ ...dm.getTitle('Movie/A')!, title: 'B' });
		expect(notices).toEqual([{ code: 'renameTargetExists', target: 'W/Movie/B.md' }]);
		expect(shown).toEqual([]);
	});

	it('reports an unsaved edit of a vanished note as a code', async () => {
		const { dm, f, notices } = await setupDataManager({
			'W/Movie/A.md': '---\ntitle: A\ntype: Movie\n---\n',
		});
		dm.applyEpisodeWatchedToggle('Movie/A', 1, true);
		f.externalDelete('W/Movie/A.md');
		await tick();
		await dm.flushPendingSave();
		expect(notices.map((n) => n.code)).toEqual(['editLost']);
		expect(shown).toEqual([]);
	});
});

describe('manager notice texts', () => {
	afterEach(() => setLocale('en'));

	it.each(['en', 'de'] as const)('invalidYaml names the file in %s', (locale) => {
		setLocale(locale);
		expect(t('notices.manager.invalidYaml', { file: 'X' })).toContain('"X"');
	});
});
