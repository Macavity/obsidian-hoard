import { Notice, type App } from 'obsidian';
import type { LocalStore } from '../../storage/LocalStore';
import { SharedConfigStore } from '../../storage/SharedConfigStore';
import { HistoryStore } from '../../storage/HistoryStore';
import { VaultLayout, detectRoot } from '../../storage/VaultLayout';
import type { YamlIO } from '../../storage/storageTypes';
import { findWatchLogBase } from './detect';
import { migrateWatchLogBase, type BaseMigration } from './base';
import type { WatchLogSource } from './pluginData';
import { SCHEMA1_BACKUP_FILE, migrateSchema1, watchLogRoot } from './schema1';
import type { Schema1Report, WatchLogData } from './schema1Types';
import { migrateWidgetFences } from './widgets';

export { WATCHLOG_PLUGIN_IDS } from './detect';
export { loadOwnOrWatchLog, type WatchLogSource } from './pluginData';
export { watchLogRoot } from './schema1';
export type { WatchLogData } from './schema1Types';

export interface WatchLogMigrationContext {
	app: App;
	local: LocalStore;
	yaml: YamlIO;
	/** Hoard's own plugin folder: the schema-1 backup goes here when data.json is Hoard's own. */
	pluginDir: string | undefined;
	/** Set when data.json was adopted from a WatchLog plugin at load (`loadOwnOrWatchLog`). */
	adopted: WatchLogSource | null;
	/** Schema-1 data awaiting conversion into notes (`LocalStore.load` reported schema 1). */
	schema1: WatchLogData | null;
	/** Type names of the current settings; type folders below the root hold the titles. */
	typeNames: () => string[];
}

export interface MigrationReport {
	base?: BaseMigration;
	/** Plugin id whose schema-2 data.json was taken over. */
	adoptedFrom?: string;
	/** Present when schema-1 data was converted; without errors it is done. */
	schema1?: Schema1Report;
	/** Notes whose widget code blocks were renamed. */
	widgetNotes: number;
}

/**
 * One-time migration of a vault used with WatchLog / WatchLog Sync, before Hoard looks for its
 * root: base file, plugin data, schema-1 data, widget code blocks. Shows one summarising Notice and
 * returns null when nothing WatchLog-related was found, so a second run is a no-op.
 */
export async function migrateFromWatchLog(ctx: WatchLogMigrationContext): Promise<MigrationReport | null> {
	const report: MigrationReport = { widgetNotes: 0 };
	const base = await findWatchLogBase(ctx.app);
	if (base) report.base = await step('base file', () => migrateWatchLogBase(ctx.app, base));
	if (ctx.adopted && !ctx.schema1) {
		// a schema-2 data.json taken over as-is: persist the copy as Hoard's own
		ctx.local.queueSave();
		report.adoptedFrom = ctx.adopted.id;
	}
	if (ctx.schema1) report.schema1 = await convertSchema1(ctx, ctx.schema1);
	// only in a vault where WatchLog was found this start: a migrated vault never scans its notes again
	if (!base && !ctx.adopted && !ctx.schema1) return null;
	report.widgetNotes = (await step('widget code blocks', () => migrateWidgetFences(ctx.app))) ?? 0;
	announce(report);
	return report;
}

async function step<T>(name: string, run: () => Promise<T>): Promise<T | undefined> {
	try {
		return await run();
	} catch (e) {
		console.error(`[Hoard] WatchLog migration: ${name} failed`, e);
		return undefined;
	}
}

/** Converts schema-1 data below the root of the (just migrated) base, else WatchLog's root folder. */
async function convertSchema1(ctx: WatchLogMigrationContext, data: WatchLogData): Promise<Schema1Report> {
	const root = (await detectRoot(ctx.app.vault)) ?? watchLogRoot(data);
	const layout = new VaultLayout(root, ctx.typeNames);
	return migrateSchema1({
		app: ctx.app,
		local: ctx.local,
		yaml: ctx.yaml,
		layout,
		shared: new SharedConfigStore(ctx.app, () => layout, ctx.yaml),
		history: new HistoryStore(ctx.app, () => layout),
		pluginDir: ctx.adopted?.dir ?? ctx.pluginDir,
		data,
	});
}

function announce(r: MigrationReport): void {
	const done: string[] = [];
	if (r.base?.status === 'migrated') {
		done.push(r.base.from === r.base.to ? `settings block in ${r.base.to}` : `${r.base.from} → ${r.base.to}`);
	} else if (r.base) {
		console.warn(`[Hoard] ${r.base.path} left untouched: ${r.base.existing} already exists`);
	}
	if (r.adoptedFrom) done.push(`settings of ${r.adoptedFrom}`);
	const s1 = r.schema1;
	if (s1 && s1.errors.length > 0) {
		console.error('[Hoard] WatchLog data could not be moved into notes; data.json is kept and the migration retried next start', s1.errors);
		new Notice('Hoard could not migrate the WatchLog data to notes. It will retry on the next start; see the developer console.', 0);
	} else if (s1) {
		done.push(`data into notes (${s1.notesCreated} created, ${s1.notesFilled} filled; backup: ${SCHEMA1_BACKUP_FILE})`);
	}
	if (s1 && s1.skipped.length > 0) console.warn('[Hoard] WatchLog migration skipped', s1.skipped);
	if (r.widgetNotes > 0) done.push(`widget code blocks in ${r.widgetNotes} note(s)`);
	if (done.length === 0) return;
	const skipped = s1 && s1.skipped.length > 0 ? ` ${s1.skipped.length} item(s) were skipped, see the developer console.` : '';
	new Notice(`Hoard migrated from WatchLog: ${done.join('; ')}.${skipped}`, 10000);
}
