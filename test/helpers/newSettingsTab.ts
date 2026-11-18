import { HoardSettingsTab, type SettingsTabHost, type SettingsTabModals } from '../../src/modules/settings/ui/SettingsTab';
import { confirmWith } from '../../src/shared/ui/ConfirmModal';

/** Fakes for the settings pane; whatever a test leaves out is an empty object. The host and modal ports are flat here. */
export type SettingsTabFakes = Partial<SettingsTabHost> & Partial<SettingsTabModals> & {
	app?: unknown;
	settings?: unknown;
	titles?: unknown;
	reading?: unknown;
	games?: unknown;
	api?: unknown;
	layout?: unknown;
	backup?: unknown;
	coverRefresher?: unknown;
};

/** The settings pane over fakes; the confirm dialog is the real one on the fake `app` unless replaced. */
export function newSettingsTab(fakes: SettingsTabFakes = {}): HoardSettingsTab {
	const app = fakes.app ?? {};
	const host = fakes as SettingsTabHost;
	const modals = { confirm: confirmWith(app as never), ...fakes } as SettingsTabModals;
	return new HoardSettingsTab(
		app as never,
		{} as never,
		fakes.settings as never,
		fakes.titles as never,
		fakes.reading as never,
		fakes.games as never,
		fakes.api as never,
		(app as { vault?: never }).vault as never,
		(fakes.layout ?? (() => ({ root: 'Hoard' }))) as never,
		(fakes.backup ?? {}) as never,
		fakes.coverRefresher as never,
		host,
		modals,
	);
}
