---
type: Module
title: Widgets
description: The hoard code-block widgets rendered inside notes, how they stay live, and how the insert command builds them.
source:
  - src/modules/widgets/ui/WidgetRenderer.ts
  - src/modules/widgets/ui/InsertWidgetModal.ts
  - src/app/main.ts
  - src/modules/import/services/watchlog/widgets.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Widgets

Fenced code blocks that render live library data anywhere in a note. Languages and what they show
are listed in the README; the mechanism is here.

## Registration

`WidgetRenderer` ([WidgetRenderer.ts](../../src/modules/widgets/ui/WidgetRenderer.ts)) is built in `onload` of
`main.ts` (no wiring file, no contract) with `SettingsReader` and `WidgetTitles`, a `Pick` of the watchlist roles
`TitleReader`, `TitleStats`, `AirtimeStore` and `TitleWriter`, and calls `registerMarkdownCodeBlockProcessor` once per language: `hoard` (block body `id: <entry id>`),
`hoard-todo` (title name, optional `mini`), `hoard-stat` (`watched`, `completed`, `remaining`,
`time`, `time completed full`), `hoard-upcoming` (`next`), `hoard-now`, `hoard-now-next`.
Each handler first marks its container with `data-theme` when a non-default Hoard colour theme
is picked, so `theme.css` themes `.hoard-widget` outside the view; it applies on the next render.

## Staying live

- Every rendered container is registered: todo widgets in `widgetRegistry` (element → title id)
  plus `widgetMiniRegistry`, every other kind as a re-render closure in `widgetRerender`.
- The renderer listens through `onDataChanged` (the `hoard-data-changed` signal on the main window,
  [overview](../architecture/overview.md#the-change-signal)) and re-renders all registered
  widgets; elements no longer connected to the DOM are dropped lazily, a missing title too.
- `cleanup()` on unload clears the registries; the listener is removed through `plugin.register`.
- Helpers exported for other views: `groupProgress`, `findNextRelease`.

## Inserting

The command `insert-widget` (`openWidgetPalette` in [main.ts](../../src/app/main.ts)) opens a
`FuzzySuggestModal` with one entry per widget variant; the todo variants then open
`InsertWidgetModal` ([InsertWidgetModal.ts](../../src/modules/widgets/ui/InsertWidgetModal.ts)) to pick a title and
insert the fence at the cursor with `editor.replaceSelection`.

## WatchLog fences

WatchLog's `watchlog` and `wl-*` fences are never rendered. They are renamed only when the user picks the
widget step of the import cleanup ([flows/watchlog-import](../flows/watchlog-import.md)):
`rewriteWidgetFences` in [widgets.ts](../../src/modules/import/services/watchlog/widgets.ts) renames the opening
fence (also indented or quoted), attributes after the language stay.

## Where to change what

- A new widget: handler in the `handlers` map, a `renderWl*` method that registers a re-render
  closure, a palette entry in `openWidgetPalette`, README table, and the fence rename map if it
  replaces an old name.
- Badge colours and tag lookups: `renderBadge`, `getTagDef` use the settings' tag definitions.
