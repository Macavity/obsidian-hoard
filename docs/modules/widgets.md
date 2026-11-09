---
type: Module
title: Widgets
description: The hoard code-block widgets rendered inside notes, how they stay live, and how the insert command builds them.
source:
  - src/WidgetRenderer.ts
  - src/InsertWidgetModal.ts
  - src/main.ts
  - src/import/watchlog/widgets.ts
source_commit: 3cf70e7d99442c30c753b169d4da73e2ad38a964
---

# Widgets

Fenced code blocks that render live library data anywhere in a note. Languages and what they show
are listed in the README; the mechanism is here.

## Registration

`WidgetRenderer` ([WidgetRenderer.ts](../../src/WidgetRenderer.ts)) is built in `onload` and calls
`registerMarkdownCodeBlockProcessor` once per language: `hoard` (block body `id: <entry id>`),
`hoard-todo` (title name, optional `mini`), `hoard-stat` (`watched`, `completed`, `remaining`,
`time`, `time completed full`), `hoard-upcoming` (`next`), `hoard-nowwatching`, `hoard-now-next`.
Each handler first marks its container with `data-theme` when a non-default Hoard colour theme
is picked, so `theme.css` themes `.hoard-widget` outside the view; it applies on the next render.

## Staying live

- Every rendered container is registered: todo widgets in `widgetRegistry` (element → title id)
  plus `widgetMiniRegistry`, every other kind as a re-render closure in `widgetRerender`.
- The renderer listens to `hoard-data-changed` on `activeDocument` and re-renders all registered
  widgets; elements no longer connected to the DOM are dropped lazily, a missing title too.
- `cleanup()` on unload clears the registries; the listener is removed through `plugin.register`.
- Helpers exported for other views: `groupProgress`, `findNextRelease`.

## Inserting

The command `insert-widget` (`openWidgetPalette` in [main.ts](../../src/main.ts)) opens a
`FuzzySuggestModal` with one entry per widget variant; the todo variants then open
`InsertWidgetModal` ([InsertWidgetModal.ts](../../src/InsertWidgetModal.ts)) to pick a title and
insert the fence at the cursor with `editor.replaceSelection`.

## Old WatchLog fences

The renderer only knows the `hoard*` names. `rewriteWidgetFences` in the [import module](import.md)
can rename WatchLog's `watchlog` and `wl-*` fences, but nothing calls it at startup.

## Where to change what

- A new widget: handler in the `handlers` map, a `renderWl*` method that registers a re-render
  closure, a palette entry in `openWidgetPalette`, README table, and the fence rename map if it
  replaces an old name.
- Badge colours and tag lookups: `renderBadge`, `getTagDef` use the settings' tag definitions.
