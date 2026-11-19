import { defined } from '../../../shared/domain/sharedHelpers';
import type { HoardTitle } from './model';

export type NewTitle = Pick<HoardTitle, 'id' | 'title' | 'type'> & Partial<HoardTitle>;

const isoNow = (): string => new Date().toISOString();

export function newTitle(fields: NewTitle, now = isoNow()): HoardTitle {
	const { id, title, type, ...rest } = fields;
	return {
		id,
		title,
		type,
		status: 'Plan to watch',
		priority: '',
		review: '',
		rating: 0,
		notes: '',
		dateStarted: null,
		dateFinished: null,
		dateAdded: now,
		dateModified: now,
		totalEpisodes: 0,
		episodeDuration: 0,
		releaseDate: null,
		externalLink: '',
		seasons: [],
		watchedEpisodes: [],
		...defined(rest),
	};
}
