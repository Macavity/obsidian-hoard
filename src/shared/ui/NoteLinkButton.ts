import { Notice, TFile, setIcon, type Vault, type Workspace } from 'obsidian';
import { t } from '../i18n';

/** What opening a note needs: a vault lookup and a leaf to open it in. */
export interface NoteFiles {
	vault: Pick<Vault, 'getAbstractFileByPath'>;
	workspace: Pick<Workspace, 'getLeaf'>;
}

/**
 * The shared "Open note" file-text icon button used by the Watchlist and Reading detail modals.
 * Callers resolve their own `.md` target (paths differ per tab) and pass it here; this only renders
 * the icon and wires open-on-click with graceful failure.
 *
 * @param target The resolved note as a `TFile`, or a vault path to look up.
 * @param onOpen Optional callback after a successful open (e.g. close the modal).
 */
export function appendNoteLinkButton(
	files: NoteFiles,
	parent: HTMLElement,
	target: TFile | string,
	onOpen?: () => void,
): HTMLElement {
	// sizing/alignment come from .hoard-accordion__link-icon (matches the globe)
	const noteIcon = parent.createSpan({ cls: 'hoard-accordion__link-icon' });
	setIcon(noteIcon, 'file-text');
	noteIcon.setAttr('aria-label', t('misc.noteLink.open'));
	noteIcon.title = t('misc.noteLink.open');
	noteIcon.addEventListener('click', (e) => {
		e.stopPropagation();
		const file =
			target instanceof TFile ? target : files.vault.getAbstractFileByPath(target);
		if (!(file instanceof TFile)) {
			new Notice(t('misc.noteLink.notFound'));
			return;
		}
		void files.workspace.getLeaf().openFile(file);
		onOpen?.();
	});
	return noteIcon;
}
