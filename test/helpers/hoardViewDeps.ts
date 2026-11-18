import { fakeSettings } from './fakeSettings';
import type { HoardViewDeps } from '../../src/HoardView';

/** The part of `HoardViewDeps` the view shell itself reads; `onResolved` receives the metadata-cache listener. */
export function hoardViewDeps(onResolved: (cb: () => void) => void = () => {}): HoardViewDeps {
	return {
		app: { metadataCache: { on: (_name: string, cb: () => void) => { onResolved(cb); return {}; } } },
		settings: fakeSettings({ colorTheme: 'default' }),
		titles: { onChange: () => {}, offChange: () => {} },
		importRunning: () => false,
	} as never;
}
