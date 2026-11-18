/** Options of the Add chooser that Drafts and Custom Lists open for a loose title; `app` wires the router. */
export interface AddRouteOptions {
	/** Prefills the search box and the title field of whichever Add modal is picked. */
	title: string;
	/** Fires once the title is actually saved into a library. */
	onAdded?: () => void;
	/** Chooser heading — "Add draft" from Drafts, "Add title" elsewhere. */
	heading?: string;
}
