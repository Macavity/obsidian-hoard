import { App, Modal } from 'obsidian';
import { t } from '../../../shared/i18n';
import type { AirtimeSchedule } from '../exports';
import type { Game } from '../../games/exports';
import {
	type ScheduleFormState,
	buildScheduleFromState,
	initialScheduleState,
	renderScheduleModal,
} from './ScheduleForm';

export interface GameScheduleOptions {
	game: Game;
	existingSchedule: AirtimeSchedule | null;
	onSave: (schedule: AirtimeSchedule) => Promise<void>;
}

export type OpenGameSchedule = (opts: GameScheduleOptions) => void;

/**
 * Schedule modal for Games — the single-release branch of AirtimeScheduleModal. A game releases
 * once, so there is no Single/Recurring toggle and no unit counters (games track a completion
 * percentage). Just a date picker; the schedule is built fresh from the visible field at Save.
 */
export class GameScheduleModal extends Modal {
	private form: ScheduleFormState; // releaseDate: YYYY-MM-DD ('' = unset) — same format the Games auto-import writes

	constructor(
		app: App,
		private readonly opts: GameScheduleOptions,
	) {
		super(app);
		this.form = initialScheduleState(opts.existingSchedule, opts.game.releaseDate, 'single');
	}

	onOpen(): void {
		this.titleEl.setText(t('misc.gameSchedule.title'));
		this.contentEl.addClass('hoard-add-modal');
		this.renderForm();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderForm(): void {
		renderScheduleModal(this.contentEl, this.form, {
			withTime: false,
			withRecurring: false,
			// the save side-effect, stated instead of silent
			hint: () => t('misc.gameSchedule.hint'),
			modal: this,
			onSave: () => this.opts.onSave(buildScheduleFromState(this.form, false)),
		});
	}
}
