import { describe, expect, it, vi } from 'vitest';
import { appendMarkWatchedButton } from '../../src/modules/watchlist/ui/MarkWatchedButton';
import { makeTitle } from '../helpers/setupDataManager';
import type { HoardTitle } from '../../src/modules/watchlist/exports';

function press(title: HoardTitle | undefined) {
	const titles = {
		getTitle: vi.fn(() => title),
		updateTitle: vi.fn(() => Promise.resolve()),
		markEpisodeWatched: vi.fn(() => Promise.resolve()),
	};
	const onChanged = vi.fn();
	const btn = appendMarkWatchedButton(titles, document.createElement('div'), 'a', onChanged);
	btn.click();
	return { titles, onChanged, btn };
}

describe('mark watched finalize', () => {
	it('completes and stamps the date when marking watched', async () => {
		const title = makeTitle({ id: 'a', status: 'Watching', dateFinished: null });
		const { titles, onChanged } = press(title);
		await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(titles.markEpisodeWatched).toHaveBeenCalledWith('a', 1, true);
		expect(title.status).toBe('Completed');
		expect(title.dateFinished).not.toBeNull();
		expect(titles.updateTitle).toHaveBeenCalledTimes(1);
	});

	it('does not save when status and date already match', async () => {
		const title = makeTitle({ id: 'a', status: 'Watching', watchedEpisodes: [] });
		const titles = {
			getTitle: vi.fn(() => title),
			updateTitle: vi.fn(() => Promise.resolve()),
			markEpisodeWatched: vi.fn(() => Promise.resolve()),
		};
		const onChanged = vi.fn();
		const btn = appendMarkWatchedButton(titles, document.createElement('div'), 'a', onChanged);
		titles.markEpisodeWatched.mockImplementation(() => {
			title.status = 'Completed';
			title.dateFinished = new Date().toISOString().slice(0, 10);
			return Promise.resolve();
		});
		btn.click();
		await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(title.status).toBe('Completed');
	});

	it('reverts to Watching and clears the date when unmarking', async () => {
		const title = makeTitle({ id: 'a', status: 'Completed', dateFinished: '2020-01-01', watchedEpisodes: [1] });
		const { titles, onChanged } = press(title);
		await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(titles.markEpisodeWatched).toHaveBeenCalledWith('a', 1, false);
		expect(title.status).toBe('Watching');
		expect(title.dateFinished).toBeNull();
		expect(titles.updateTitle).toHaveBeenCalledTimes(1);
	});

	it('does not save when unmarking a non-completed title', async () => {
		const title = makeTitle({ id: 'a', status: 'Watching', watchedEpisodes: [1] });
		const { titles, onChanged } = press(title);
		await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(titles.updateTitle).not.toHaveBeenCalled();
	});

	it('does nothing when the title is gone', async () => {
		const { titles, onChanged } = press(undefined);
		await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(titles.updateTitle).not.toHaveBeenCalled();
	});
});
