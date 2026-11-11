import { typeLabel } from '../i18n/labels';
import { getThemedColor, type HoardPluginSettings } from '../types';

/** The small type badge: a themed coloured pill when `coloredTypeBadges` is on, plain text otherwise. */
export function renderTypeBadge(
	parent: HTMLElement,
	typeName: string,
	settings: Pick<HoardPluginSettings, 'types' | 'coloredTypeBadges' | 'colorTheme'>,
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
