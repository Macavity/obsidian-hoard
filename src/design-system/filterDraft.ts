/**
 * Draft operations of the filter panel. They only mutate the draft's exclude sets, never the DOM;
 * the panel derives its checkbox states from the sets afterwards.
 */

/** The part of a filter section the draft operations touch (structurally a `FilterSection`). */
export interface DraftSection {
	opts: readonly string[];
	excludeSet: Set<string>;
}

/** Select all: every option of every section included. */
export function includeAllOptions(sections: readonly DraftSection[]): void {
	for (const { excludeSet } of sections) excludeSet.clear();
}

/** Deselect all: every option of every section excluded. */
export function excludeAllOptions(sections: readonly DraftSection[]): void {
	for (const { opts, excludeSet } of sections) {
		for (const opt of opts) excludeSet.add(opt);
	}
}

/** True when the section has options and none of them is excluded. */
export function isSectionAllIncluded(section: DraftSection): boolean {
	return section.opts.length > 0 && section.opts.every((opt) => !section.excludeSet.has(opt));
}

/** The section's ◆ All toggle: everything included → exclude all, otherwise include all. */
export function toggleSectionAll(section: DraftSection): void {
	if (isSectionAllIncluded(section)) excludeAllOptions([section]);
	else includeAllOptions([section]);
}
