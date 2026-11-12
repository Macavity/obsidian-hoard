// Stylelint for src/styles. The class pattern is derived from BEM_PATTERN, the one definition the class check uses too.
import { BEM_PATTERN } from "./scripts/lib/css-classes.mjs";

const hoardClass = BEM_PATTERN.source.replace(/^\^|\$$/g, "");

export default {
	extends: "stylelint-config-standard",
	rules: {
		"no-descending-specificity": null,
		// the bundler (scripts/lib/bundle-styles.mjs) parses `@import "file.css";`
		"import-notation": "string",
		// Hoard classes follow BEM; anything else is a class of Obsidian or a state (`is-*`)
		"selector-class-pattern": [
			`^(?:${hoardClass}|(?!hoard-)[a-z][a-z0-9-]*)$`,
			{ message: "Hoard classes are hoard-<block>[__<element>][--<modifier>] (docs/architecture/css-blocks.md)" },
		],
		// -moz-appearance and -webkit-appearance are deliberate: the unprefixed form would restyle number inputs
		"property-no-vendor-prefix": null,
	},
};
