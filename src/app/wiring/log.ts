import type { App } from 'obsidian';
import { confirmWith } from '../../shared/ui/ConfirmModal';
import { LogTab, type LogTabHistory } from '../../modules/log/ui/LogTab';

/** The core objects the Log tab is built from. */
export interface LogCore {
	app: App;
	history: LogTabHistory;
}

/** What the rest of the app opens: the Log tab. */
export interface LogUi {
	createLogTab: (container: HTMLElement) => LogTab;
}

/** Builds the Log tab factory; the only place that `new`s the tab. */
export function logUi(core: LogCore): LogUi {
	const confirm = confirmWith(core.app);
	return { createLogTab: (container) => new LogTab(container, core.history, confirm) };
}
