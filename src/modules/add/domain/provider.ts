export type AddKind = 'anime' | 'series' | 'movie' | 'manga' | 'book' | 'game';

/** Canonical order of the wizard's sections. */
export const ADD_KINDS: readonly AddKind[] = ['anime', 'series', 'movie', 'manga', 'book', 'game'];

/** Where the new entry goes: a library tab, or a Maybe note. */
export type AddTarget = 'library' | 'maybe';

/** One search hit, already mapped to what the wizard shows. */
export interface AddHit {
	kind: AddKind;
	id: string;
	title: string;
	meta: string;
	thumbUrl?: string;
	fallbackIcon: string;
	/** Name of the library that already holds this hit, or null when it is new. */
	inLibrary: string | null;
}

/** `id` is the id of the entry that was created. */
export interface AddDone {
	kind: AddKind;
	id: string;
}

export interface AddFormContext {
	kind: AddKind;
	/** The picked hit; null for a manual entry. */
	hit: AddHit | null;
	query: string;
	target: AddTarget;
	back(): void;
	/** Closes the wizard and reports the new entry. */
	done(result: AddDone): void;
}

export interface AddFormHandle {
	destroy(): void;
}

/** What a feature module offers the add wizard: search per kind and the form that saves an entry. */
export interface AddProvider {
	readonly kinds: readonly AddKind[];
	/** Kinds this provider can save as a Maybe note. */
	readonly maybeKinds?: readonly AddKind[];
	search(kind: AddKind, query: string): Promise<AddHit[]>;
	/** `ctx.hit` is null for a manual entry. */
	renderForm(host: HTMLElement, ctx: AddFormContext): AddFormHandle;
	/**
	 * Null means the text is not this provider's URL. Runs on every query, so it must return null
	 * quickly and without network access for text that is not a URL it owns.
	 */
	resolveUrl?(text: string): Promise<AddHit | null>;
}

export interface AddWizardOptions {
	query?: string;
	preferredKinds?: readonly AddKind[];
	target?: AddTarget;
	onAdded?(done: AddDone): void;
}

export type OpenAddWizard = (opts: AddWizardOptions) => void;
