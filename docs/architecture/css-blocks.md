---
type: Architecture
title: CSS blocks
description: The register of BEM blocks every Hoard class belongs to, and the naming rules the check enforces.
source:
  - src/styles/*.css
  - scripts/lib/css-classes.mjs
  - scripts/check-css-classes.mjs
source_commit: 4d38f406cb79eed247dfa2b7d658d361b91f5f41
---

# CSS blocks

Every Hoard class is `hoard-<block>[__<element>][--<modifier>]`. The block is a component with its own
function, taken from this register; the register is curated, not derived from the first word of a name.
A new block is added here only when one function or class creates the element and no block fits.
Stylesheets are listed by file name under `src/styles/`, without extension.

## Naming

- **Pattern**: lowercase letters and digits, single hyphens inside each part. One element level only
  (`hoard-card__title-text`, never `hoard-card__a__b`). `BEM_PATTERN` in `scripts/lib/css-classes.mjs`.
- **Modifier** (`--`): only when TypeScript puts the class on the same element as the base class
  (`hoard-btn hoard-btn--sm`); otherwise the class is an element. State-like names (`hidden`, `selected`,
  `dragging`, `editing`, `checked`) are modifiers, not `is-*`.
- **States**: `is-*` and `has-*` stay as they are; Obsidian's own classes (`modal-content`, `setting-item`)
  are never renamed.
- **Abbreviations are spelled out** (`custom-list`, not `cl`; `column`, not `col`). Allowed short parts
  (`ALLOWED_SHORT`): established abbreviations (`btn`, `img`, `nav`, `csv`, `api`, `id`, `url`, `th`, `td`, `tr`,
  `sm`, `md`, `lg`), proper names and formats (`svg`, `mal`, `jst`) and plain words (`row`, `tab`, `bar`, `add`, `log`, …).
  `shortTokens` reports every other part of three letters or fewer. Custom properties
  (`--hoard-<block>-<name>`) follow the same rules.
- **Check**: `scripts/check-css-classes.mjs` (part of `pnpm lint`) fails on any class that `shortTokens` or
  `notBem` reports; stylelint's `selector-class-pattern` enforces the same pattern in the stylesheets.
  Container names are not classes and stay plain kebab-case (`hoard-list-table`).
- **Protected strings**: `hoard-view` is both the CSS class and the view type, so it keeps its name.
  Code-block languages, event names, element ids and secret ids that start with `hoard-` are no classes.

## Frame and toolbar

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-view` | base | The root element of the Hoard view and the mobile layout switch. |
| `hoard-tab-bar` | base | The row of main tabs. |
| `hoard-inner-tabs` | base, utilities | Sub-tabs inside a tab. |
| `hoard-toolbar` | selection, list, add-button, responsive | Header controls, results count and the add button above a tab. |
| `hoard-search-box` | list, reading | The search input with its clear button. |
| `hoard-search-help` | search-help | The search syntax help modal. |
| `hoard-filter-panel` | filters, controls, utilities, edit-columns | The filter panel and its clear and favourite toggles. |
| `hoard-sort-panel` | filters, utilities, custom-lists-views, add-button | Sort field and direction controls. |
| `hoard-view-switch` | filters | The control that switches between card, list and row views. |
| `hoard-action-bar` | selection | The bar for selection mode and its bulk actions. |
| `hoard-popover` | add-button, utilities | Anchored dropdowns and fixed-position popovers. |

## Building blocks

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-btn` | buttons, modals, selection, steam-sync, utilities | The shared button; variants are modifiers. |
| `hoard-icon-btn` | icon-button | The icon-only button of the UI kit. |
| `hoard-badge` | list, list-extras, airtime, utilities | Small labels for priority, episode counts and types. |
| `hoard-chevron` | list | The expand and collapse arrow. |
| `hoard-input` | modals, list, custom-lists, airtime | Text, select and time inputs. |
| `hoard-progress` | list | Progress bar and its wrapper. |
| `hoard-segmented` | controls | Segmented toggle with exclusive options. |
| `hoard-mode-pill` | controls | Pill that shows and switches a mode. |
| `hoard-star-rating` | accordion, detail-rating | Clickable star rating and its divider. |
| `hoard-rating-tier` | accordion | Rating tier labels. |
| `hoard-date-picker` | date-picker, accordion | The date picker popup and date fields. |
| `hoard-color-picker` | manage-columns, settings | Colour swatch pickers. |
| `hoard-status-dropdown` | reading-detail, games | Status dropdown with its options and dots. |
| `hoard-community-rating` | detail-rating | Community rating display in detail views. |
| `hoard-trailer-btn` | detail-rating, mobile-detail | The trailer link button. |
| `hoard-store-btn` | detail-rating, mobile-detail | The store link button. |
| `hoard-wishlist-btn` | detail-rating, mobile-detail | The wishlist toggle button. |
| `hoard-sticky-footer` | collections, modal-footer | A footer pinned to the bottom of a modal. |
| `hoard-hidden` | utilities | Utility: hides an element. |
| `hoard-divider` | list, utilities | Utility: horizontal divider. |
| `hoard-force-overflow-auto` | selection, utilities | Utility: forces scrollable overflow. |
| `hoard-vertical-separator` | widgets, list, utilities | Utility: vertical separator between inline items. |

## Cards and lists

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-card` | airtime, collections, detail-rating | The poster card and its parts (not the size and style settings). |
| `hoard-card-grid` | airtime, collections | The grid that lays cards out. |
| `hoard-group-header` | add-button, utilities | Header of a collapsible group. |
| `hoard-rows-view` | custom-lists-views, title-detail | The rows view with shelves and strips. |
| `hoard-rows-customize` | filters, list | The rows customisation modal. |
| `hoard-list` | list, list-extras, selection, accordion | The list and table view with rows, columns and virtual scrolling. |
| `hoard-accordion` | accordion, add-button, dashboard, list-extras | Expandable season and episode sections and their footer actions. |

## Detail and add modals

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-detail` | title-detail, mobile-detail, detail-footer, credits, collections, inline-widget | The title detail modal. |
| `hoard-credits` | credits, mobile-detail | Cast and crew section and the credit modals. |
| `hoard-collection` | collections | The collection modal. |
| `hoard-notes-editor` | edit-columns | The notes modal with edit and preview modes. |
| `hoard-reading-detail` | reading-detail, mobile-detail, airtime, collections | The book and manga detail modal. |
| `hoard-reading-custom-fields` | reading-fields | Custom fields in the reading detail. |
| `hoard-reading-quotes` | reading-fields, drafts | Quotes in the reading detail. |
| `hoard-game-detail` | games, steam-sync, controls, mobile-detail | The game detail modal. |
| `hoard-modal` | modals, controls, airtime, drafts, edit-columns, utilities | Shared modal frame, add modal, duplicate warning and URL rows. |
| `hoard-search-picker` | modals, credits, mobile-detail | Search form and result grid of the add modals. |
| `hoard-reading-form` | reading-modals | The add and edit form for books and manga. |
| `hoard-import` | modals, csv-modal | Import dialogs and their header mapping. |
| `hoard-draft-choice` | manage-columns | The dialog that decides what to do with a draft. |
| `hoard-schedule` | airtime | The schedule modal and its clock. |

## Tabs

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-reading` | reading, base, selection | The reading tab: toolbar, sub-tabs, grid and empty states. |
| `hoard-reading-card` | reading, collections, detail-rating, custom-lists | The book and manga card. |
| `hoard-reading-columns` | manage-columns, custom-lists | Column management of the reading tab. |
| `hoard-games` | games | The games tab. |
| `hoard-airtime` | airtime, upcoming, inline-widget, selection | The airtime tab and its entries. |
| `hoard-tracker` | airtime | The episode tracker inside airtime. |
| `hoard-maybe-card` | upcoming, drafts | The card for a maybe-add candidate. |
| `hoard-custom-lists` | custom-lists | The custom lists tab frame: toolbar, sub-tabs, header, draft banner. |
| `hoard-custom-list-table` | custom-lists, custom-lists-views, utilities | The editable table of a custom list. |
| `hoard-edit-columns` | edit-columns, manage-columns, custom-lists, utilities | The column editor of a custom list. |
| `hoard-drafts` | drafts | The drafts tab. |
| `hoard-dashboard` | dashboard | The dashboard layout, summary metrics and empty state. |
| `hoard-stat-ring` | dashboard | Ring charts on the dashboard. |
| `hoard-stat-rect` | dashboard-cards, list | Rectangular stat tiles. |
| `hoard-stats-card` | dashboard | Statistics cards with lists and toggles. |
| `hoard-recent` | dashboard, utilities | Recently watched and recently added items. |
| `hoard-suggestions` | suggestions | The suggestions section. |
| `hoard-log` | log | The Log tab. |

## Widgets

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-widget` | base, inline-widget, add-button, widgets | The shared frame of every code-block widget. |
| `hoard-widget-stat` | base, widgets | The stat widget and its cards. |
| `hoard-widget-now` | base, widgets | The now-watching widget. |
| `hoard-widget-now-next` | base, widgets | The now and next widget. |
| `hoard-widget-upcoming` | base, widgets | The upcoming widget. |
| `hoard-statusbar` | settings-cards | The status bar item that counts due episodes. |

## Settings and wizards

| Block | Stylesheet | Purpose |
|---|---|---|
| `hoard-settings` | settings, base, controls, csv-modal | The settings tab. |
| `hoard-settings-group` | settings, settings-cards | A collapsible group of settings. |
| `hoard-quick-info` | drafts, utilities | The quick-info boxes in settings and drafts. |
| `hoard-api-provider` | settings, controls | API provider rows and their status. |
| `hoard-folder-list` | settings | The list of configured folders. |
| `hoard-tag-editor` | settings, modal-footer | Tag and season colour editing. |
| `hoard-theme-picker` | theme | The theme selection. |
| `hoard-card-size` | settings-cards | The card size options. |
| `hoard-card-style` | settings-cards | The card style options. |
| `hoard-csv` | csv-modal | CSV import and export modals and the regenerate progress. |
| `hoard-steam-sync` | steam-sync | The Steam sync wizard. |
| `hoard-onboarding` | onboarding | The onboarding wizard. |
