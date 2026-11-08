import type enOnboarding from '../en/onboarding';
import type { DeepPartial } from '../index';

const onboarding = {
	title: 'Aus WatchLog importieren',
	none: 'Keine WatchLog-Daten gefunden.',
	running: 'Import läuft…',
	steps: { found: 'Gefunden', import: 'Importieren', result: 'Ergebnis', cleanup: 'Aufräumen', done: 'Fertig' },
	buttons: {
		import: 'Importieren',
		later: 'Später',
		decline: 'Nicht importieren',
		retry: 'Erneut versuchen',
		next: 'Weiter',
		report: 'Bericht als Notiz speichern',
		cleanupRun: 'Auswahl aufräumen',
		skip: 'Überspringen',
		close: 'Schließen',
	},
	found: {
		intro: 'Hoard hat Daten dieser Plugins gefunden. Der Import kopiert sie; es wird nichts gelöscht.',
		forkHint: 'WatchLog Sync hat die Daten des originalen WatchLog bereits übernommen, daher ist das Original nicht vorausgewählt.',
		hoardData: 'Hoard hat bereits Daten. Der Import ergänzt nur, was fehlt; warte auf anderen Geräten, bis die Synchronisierung fertig ist.',
		pluginEnabled: 'Nutze {plugin} nicht während des Imports.',
	},
	counts: {
		titles: { one: '{count} Titel', other: '{count} Titel' },
		books: { one: '{count} Buch', other: '{count} Bücher' },
		manga: { one: '{count} Manga', other: '{count} Manga' },
		games: { one: '{count} Spiel', other: '{count} Spiele' },
		lists: { one: '{count} Liste', other: '{count} Listen' },
		notes: { one: '{count} Notiz', other: '{count} Notizen' },
	},
	phase: {
		notes: 'Notizen werden kopiert',
		history: 'Verlauf wird kopiert',
		base: 'Base wird kopiert',
		settings: 'Einstellungen werden kopiert',
	},
	progress: '{phase} {done}/{total}',
	result: {
		created: { one: '{count} erstellt', other: '{count} erstellt' },
		filled: { one: '{count} ergänzt', other: '{count} ergänzt' },
		review: { one: '{count} zu prüfen', other: '{count} zu prüfen' },
		errors: { one: '{count} Fehler', other: '{count} Fehler' },
		reviewHeading: 'Zu prüfen',
		reasons: { exists: 'Existierte bereits', keptValue: 'Hoard-Wert behalten', error: 'Fehler' },
		reportSaved: 'Bericht gespeichert: {path}',
		retryHint: 'Einige Daten ließen sich nicht importieren. Versuche es erneut; noch nichts gilt als importiert.',
		cleanupLocked: 'Aufräumen bleibt für diese Quelle gesperrt, bis sie fehlerfrei importiert ist.',
		allClean: 'Fehlerfrei importiert.',
	},
	cleanup: {
		intro: 'Optional. Nichts ist vorausgewählt; gelöschte Notizen landen im Papierkorb.',
		none: 'Nichts aufzuräumen.',
		items: {
			originalNotes: 'Alte Notizen von WatchLog in den Papierkorb verschieben',
			forkNotes: 'Kopierte Notizen von WatchLog Sync in den Papierkorb verschieben',
			forkBase: 'WatchLog.base in den Papierkorb verschieben',
			widgets: 'Widget-Codeblöcke watchlog/wl-* in hoard/hoard-* umbenennen',
		},
		widgetsWarning: 'Bricht die Widgets von WatchLog, falls du es weiter nutzt.',
		pluginEnabled: '{plugin} ist noch aktiv und kann diese Notizen neu anlegen.',
		files: { one: '{count} Datei', other: '{count} Dateien' },
	},
	done: {
		cleanupDone: { one: '{count} Aufräumschritt erledigt.', other: '{count} Aufräumschritte erledigt.' },
		cleanupErrors: { one: '{count} Fehler beim Aufräumen.', other: '{count} Fehler beim Aufräumen.' },
		skipped: 'Du kannst später in den Hoard-Einstellungen aufräumen.',
		uninstall: 'Deinstalliere WatchLog unter Community-Plugins, um seine alten Plugin-Daten zu entfernen.',
	},
	settings: {
		importButton: 'Aus WatchLog importieren…',
		importDesc: 'Kopiere deine Daten aus WatchLog oder WatchLog Sync nach Hoard.',
		cleanupButton: 'WatchLog-Reste aufräumen…',
		cleanupDesc: 'Verschiebe vom Import kopierte Notizen optional in den Papierkorb.',
	},
} satisfies DeepPartial<typeof enOnboarding>;

export default onboarding;
