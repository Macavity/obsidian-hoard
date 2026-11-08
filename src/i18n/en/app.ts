const app = {
	ribbon: 'Hoard',
	viewTitle: 'Hoard',
	commands: {
		openPanel: 'Open panel',
		addTitle: 'Add title',
		insertWidget: 'Insert widget',
		searchTitle: 'Search title',
	},
	tabs: {
		dashboard: 'Dashboard',
		watchlist: 'Watchlist',
		reading: 'Reading',
		games: 'Games',
		upcoming: 'Upcoming',
		customLists: 'Custom lists',
		drafts: 'Drafts',
		log: 'Log',
	},
	statusBar: {
		label: 'Hoard: upcoming due',
		due: { one: '{count} due', other: '{count} due' },
	},
	titleNotice: '"{title}" · {type} · {status}',
	widgetPlaceholder: 'Select a widget to insert...',
	widgets: {
		todoFull: 'Track a title (full)',
		todoMini: 'Track a title (compact)',
		statWatched: 'Time watched (mini)',
		statCompleted: 'Completed titles (mini)',
		statRemaining: 'Time remaining (mini)',
		statTime: 'Watched + remaining (mini)',
		upcomingNext: 'Next upcoming (mini)',
		statTimeCompletedFull: 'Time · remaining · completed card',
		nowNext: 'Now watching + up next card',
	},
	notices: {
		newerSchema: 'Hoard: data.json was written by a newer plugin version. Device settings are not saved until you update.',
		baseFilterMissing: 'Hoard: the folder filter in {file} was not found; the base view may list other notes.',
		loadFailed: 'Hoard could not load its notes. See the developer console for details.',
		watchLogEnabled: 'WatchLog is still enabled. Disable it, otherwise both plugins write the same notes.',
		noTitles: 'No titles in your Hoard library yet.',
	},
} as const;

export default app;
