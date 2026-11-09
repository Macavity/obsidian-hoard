import type enApp from '../en/app';
import type { DeepPartial } from '../index';

const app = {
	ribbon: 'Hoard',
	viewTitle: 'Hoard',
	commands: {
		openPanel: 'Panel öffnen',
		addTitle: 'Titel hinzufügen',
		insertWidget: 'Widget einfügen',
		searchTitle: 'Titel suchen',
	},
	tabs: {
		dashboard: 'Dashboard',
		watchlist: 'Watchlist',
		reading: 'Lesen',
		games: 'Spiele',
		upcoming: 'Demnächst',
		customLists: 'Eigene Listen',
		drafts: 'Entwürfe',
		log: 'Verlauf',
	},
	statusBar: {
		label: 'Hoard: Fällige Neuerscheinungen',
		due: { one: '{count} fällig', other: '{count} fällig' },
	},
	titleNotice: '"{title}" · {type} · {status}',
	widgetPlaceholder: 'Widget zum Einfügen auswählen...',
	widgets: {
		todoFull: 'Titel tracken (voll)',
		todoMini: 'Titel tracken (kompakt)',
		statWatched: 'Gesehene Zeit (mini)',
		statCompleted: 'Abgeschlossene Titel (mini)',
		statRemaining: 'Verbleibende Zeit (mini)',
		statTime: 'Gesehen + verbleibend (mini)',
		upcomingNext: 'Nächste Neuerscheinung (mini)',
		statTimeCompletedFull: 'Karte mit Zeit · Verbleibend · Abgeschlossen',
		nowNext: 'Karte mit Aktuell und Als Nächstes',
	},
	notices: {
		newerSchema: 'Hoard: data.json stammt von einer neueren Plugin-Version. Geräteeinstellungen werden erst nach einem Update gespeichert.',
		watchLogData: 'Hoard: Die data.json enthält WatchLog-Daten, die Hoard nicht verändert. Geräteeinstellungen (inklusive API-Schlüssel) werden erst gespeichert, wenn du die Datei aus Hoards Plugin-Ordner verschiebst.',
		baseFilterMissing: 'Hoard: Der Ordnerfilter in {file} wurde nicht gefunden; die Base-Ansicht zeigt eventuell andere Notizen.',
		loadFailed: 'Hoard konnte seine Notizen nicht laden. Details stehen in der Entwicklerkonsole.',
		noTitles: 'Noch keine Titel in deiner Hoard-Bibliothek.',
	},
} satisfies DeepPartial<typeof enApp>;

export default app;
