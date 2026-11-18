import { fakeSettings } from './fakeSettings';
import type { HoardViewDeps } from '../../src/app/HoardView';

/** A tab that renders nothing. */
const stubTab = () => ({ render: () => {} });

/** The part of `HoardViewDeps` the view shell itself reads, with tabs that render nothing; `onResolved` receives the metadata-cache listener. */
export function hoardViewDeps(
	onResolved: (cb: () => void) => void = () => {},
	extra: Partial<HoardViewDeps> = {},
): HoardViewDeps {
	return {
		app: { metadataCache: { on: (_name: string, cb: () => void) => { onResolved(cb); return {}; } } },
		settings: fakeSettings({ colorTheme: 'default' }),
		titles: { onChange: () => {}, offChange: () => {} },
		importRunning: () => false,
		countPendingDrafts: () => Promise.resolve(0),
		createDashboardTab: stubTab,
		createListTab: stubTab,
		createAirtimeTab: stubTab,
		createReadingTab: stubTab,
		createGamesTab: stubTab,
		createCustomListsTab: stubTab,
		createDraftsTab: stubTab,
		createLogTab: stubTab,
		...extra,
	} as never;
}
