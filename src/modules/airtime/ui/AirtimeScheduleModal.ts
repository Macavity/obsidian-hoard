import { App, Modal } from 'obsidian';
import { t } from '../../../shared/i18n';
import type { AirtimeSchedule } from '../exports';
import type { HoardTitle } from '../../watchlist/exports';
import {
	type ScheduleFormState,
	RECURRENCE_OPTIONS,
	buildScheduleFromState,
	counterField,
	initialScheduleState,
	renderCounterRow,
	renderScheduleModal,
	resolveScheduleMode,
} from './ScheduleForm';

/** Without a schedule the title's shape only picks the DEFAULT mode; the toggle makes it overridable. */
function defaultScheduleMode(title: HoardTitle): 'single' | 'recurring' {
	return title.totalEpisodes <= 1 ? 'single' : 'recurring';
}

export interface AirtimeScheduleOptions {
	title: HoardTitle;
	existingSchedule: AirtimeSchedule | null;
	currentSeason: number | null;
	currentEpisode: number | null;
	totalSeasons: number | null;
	totalEpisodes: number | null;
	onSave: (
		schedule: AirtimeSchedule,
		season: number | null,
		episode: number | null,
		totalSeasons: number | null,
		totalEpisodes: number | null,
	) => Promise<void>;
	initialMode?: 'single' | 'recurring';
}

export type OpenAirtimeSchedule = (opts: AirtimeScheduleOptions) => void;

export class AirtimeScheduleModal extends Modal {
	// UI state — Save assembles a fresh AirtimeSchedule from the fields the active mode/recurrence
	// actually shows (buildSchedule), so a value left over from another mode can never leak in
	// releaseDate is YYYY-MM-DD ('' = unset) — same format the Watchlist/Reading auto-import writes;
	// releaseTime is HH:MM ('' = unset), local time
	private form: ScheduleFormState;
	private currentSeason: number | null;
	private currentEpisode: number | null;
	private totalSeasons: number | null;
	private totalEpisodes: number | null;

	constructor(
		app: App,
		private readonly opts: AirtimeScheduleOptions,
	) {
		super(app);
		const { title } = opts;
		this.form = initialScheduleState(
			opts.existingSchedule,
			title.releaseDate,
			resolveScheduleMode(opts.existingSchedule, opts.initialMode, defaultScheduleMode(title)),
		);
		this.currentSeason = opts.currentSeason;
		this.currentEpisode = opts.currentEpisode;
		this.totalSeasons = opts.totalSeasons ?? (title.seasons.length > 0 ? title.seasons.length : null);
		this.totalEpisodes = opts.totalEpisodes ?? (title.totalEpisodes > 0 ? title.totalEpisodes : null);
	}

	onOpen(): void {
		this.titleEl.setText(t('airtime.modal.title'));
		this.contentEl.addClass('hoard-add-modal');
		this.renderForm();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Local HH:MM → its JST (UTC+9) equivalent, accounting for the local offset so DST is handled.
	 * Display only — the schedule stores the local time as entered.
	 */
	private localHHMMtoJST(localHHMM: string): string {
		if (!localHHMM || !/^\d{2}:\d{2}$/.test(localHHMM)) return '—';
		const [hStr, mStr] = localHHMM.split(':');
		const h = parseInt(hStr ?? '0', 10);
		const m = parseInt(mStr ?? '0', 10);
		// a Date for today at the given local time
		const now = new Date();
		const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
		// .getTime() is UTC epoch; add 9h for JST
		const jstMs = local.getTime() + 9 * 60 * 60 * 1000;
		const jst = new Date(jstMs);
		// format in UTC — the JST offset is already added
		const jh = jst.getUTCHours().toString().padStart(2, '0');
		const jm = jst.getUTCMinutes().toString().padStart(2, '0');
		return `${jh}:${jm}`;
	}

	/** Progress: one compact row — Season [2] of [3] · Episode [7] of [13]. */
	private renderCounters(parent: HTMLElement): void {
		renderCounterRow(parent, [
			{
				label: t('airtime.modal.season'),
				current: counterField(t('airtime.modal.currentSeason'), this.currentSeason, (v) => { this.currentSeason = v; }, 1),
				total: counterField(t('airtime.modal.totalSeasons'), this.totalSeasons, (v) => { this.totalSeasons = v; }, 1),
			},
			{
				label: t('airtime.modal.episode'),
				current: counterField(t('airtime.modal.nextEpisode'), this.currentEpisode, (v) => { this.currentEpisode = v; }, 1),
				total: counterField(t('airtime.modal.totalEpisodes'), this.totalEpisodes, (v) => { this.totalEpisodes = v; }),
			},
		]);
	}

	private renderForm(): void {
		renderScheduleModal(this.contentEl, this.form, {
			withTime: true,
			withRecurring: true,
			recurrenceLabel: t('airtime.modal.airs'),
			recurrenceOptions: RECURRENCE_OPTIONS,
			modeLabels: [t('ui.schedule.single'), t('airtime.modal.recurringEpisodes')],
			hint: (mode) => mode === 'single'
				? t('airtime.modal.hintSingle')
				: t('airtime.modal.hintRecurring'),
			timeNote: (time) => time
				? t('airtime.modal.timeNote', { time: this.localHHMMtoJST(time) })
				: t('airtime.modal.timeNoteEmpty'),
			renderCounters: (parent) => this.renderCounters(parent),
			modal: this,
			onSave: async () => {
				await this.opts.onSave(
					buildScheduleFromState(this.form, true),
					this.currentSeason,
					this.currentEpisode,
					this.totalSeasons,
					this.totalEpisodes,
				);
			},
		});
	}
}
