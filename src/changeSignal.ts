/**
 * The app-wide change signal: one DOM event on the plugin's own (main) window.
 *
 * Never `activeDocument` here: that is whichever window has the focus (the settings window, a
 * popout). A listener added at load and a change dispatched from a click in the settings window
 * would meet on different documents, and the change would be lost.
 */
const EVENT = 'hoard-data-changed';

const target = (): Document => window.document;

export function emitDataChanged(): void {
	target().dispatchEvent(new CustomEvent(EVENT));
}

/** Calls `listener` on every change; the returned function removes it again. */
export function onDataChanged(listener: () => void): () => void {
	const doc = target();
	doc.addEventListener(EVENT, listener);
	return () => doc.removeEventListener(EVENT, listener);
}
