/**
 * Titles listed after the first occurrence of `tag` in a line: the rest of the line is split on
 * commas and trimmed; empty segments and segments over 100 characters are dropped.
 */
export function draftTitlesInLine(line: string, tag: string): string[] {
	const tagIdx = line.indexOf(tag);
	if (tagIdx < 0) return [];
	return line
		.slice(tagIdx + tag.length)
		.trim()
		.split(',')
		.map((seg) => seg.trim())
		.filter((title) => title !== '' && title.length <= 100);
}
