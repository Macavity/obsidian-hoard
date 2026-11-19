import { typeLabel } from '../shared/i18n/labels';
import { getThemedColor } from '../shared/domain/tags';

/** What the badge needs to know: the type colours, whether badges are coloured, and the theme. */
export interface TypeBadgeStyle {
	readonly types: readonly { readonly name: string; readonly color: string }[];
	readonly coloredTypeBadges: boolean;
	readonly colorTheme: string;
}

/** The small type badge: a themed coloured pill when `coloredTypeBadges` is on, plain text otherwise. */
export function renderTypeBadge(
	parent: HTMLElement,
	typeName: string,
	settings: TypeBadgeStyle,
): HTMLSpanElement {
	const colored = settings.coloredTypeBadges;
	const badge = parent.createSpan({
		cls: colored ? 'hoard-badge hoard-badge--sm' : 'hoard-badge__plain',
		text: typeLabel(typeName),
	});
	const typeDef = settings.types.find((d) => d.name === typeName);
	if (colored && typeDef) badge.setCssProps({ '--hoard-badge-color': getThemedColor(typeName, typeDef.color, settings.colorTheme) });
	return badge;
}
