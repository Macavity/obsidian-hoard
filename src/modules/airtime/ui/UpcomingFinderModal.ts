import { App, FuzzySuggestModal } from 'obsidian';
import { t } from '../../../shared/i18n';

/** A unified finder entry spanning watchlist titles, reading items and games. */
export interface UpcomingFinderItem {
	source: 'watchlist' | 'reading' | 'game';
	kind?: 'book' | 'manga';
	id: string;
	title: string;
	/** Type/kind label shown in parentheses (e.g. "Anime", "Book", "Manga"). */
	typeLabel: string;
}

export interface UpcomingFinderOptions {
	items: UpcomingFinderItem[];
	onSelect: (item: UpcomingFinderItem) => void;
}

export type OpenUpcomingFinder = (opts: UpcomingFinderOptions) => void;

/**
 * The shared "+ add" finder for the Upcoming tab. Extends the watchlist finder to also surface
 * Reading items and Games, so any tracked title is added through the same pathway.
 */
export class UpcomingFinderModal extends FuzzySuggestModal<UpcomingFinderItem> {

	constructor(
		app: App,
		private readonly opts: UpcomingFinderOptions,
	) {
		super(app);
		this.setPlaceholder(t('misc.upcomingFinder.placeholder'));
	}

	getItems(): UpcomingFinderItem[] {
		return this.opts.items;
	}

	getItemText(item: UpcomingFinderItem): string {
		return `${item.title} (${item.typeLabel})`;
	}

	onChooseItem(item: UpcomingFinderItem): void {
		this.opts.onSelect(item);
	}
}
