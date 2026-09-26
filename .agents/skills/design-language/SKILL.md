---
name: design-language
description: Use when building, modifying, or fixing any UI in the FlowKey launcher — shell views (list, grid, detail), settings pages, extension UI trees, icons, spacing, or visual bug fixes. Answers "what do I use here?" for theme resources, typography, the three view types, icons, and layout. Not for architecture or protocol decisions (use architectural-integrity / review-ipc).
---

# FlowKey Design Language

This file answers one question: **given what you are building, what do you use?**

FlowKey's UI is native WPF. Extension UI arrives as a serialized tree rendered
by the shell; the shell's own surfaces (launcher window, settings, action
panel, HUD) are XAML. Everything visual lives in
`flowkey-native/shell/src/Shell/Theme.xaml` as keyed resources — never
hardcode a color, size, or radius in code-behind or XAML.

## 1. Theme resources — the lookup tables

### Surfaces (dark theme, back to front)

| Resource                                            | Value                   | Use                                       |
| --------------------------------------------------- | ----------------------- | ----------------------------------------- |
| `WindowBackgroundBrush`                             | `#1F1F1F`               | window root                               |
| `ChromeBackgroundBrush`                             | `#2A2A2A`               | titlebar/chrome                           |
| `SurfaceBrush` / `SurfaceAltBrush`                  | `#262626` / `#161616`   | cards, popups, panels                     |
| `RowBackgroundBrush` / `RowSelectedBackgroundBrush` | transparent / `#363636` | list rows                                 |
| `CellBackgroundBrush`                               | `#2A2A2C`               | grid cells (tinted lighter when selected) |
| `CellSelectedOutlineBrush`                          | `#FFFFFF`               | 2px selected-cell outline                 |
| `ActionPanelBackgroundBrush`                        | `#1E1E1E`               | Ctrl+K palette                            |
| `DividerBrush`                                      | `#363636`               | 1px separators                            |

### Text

| Resource             | Value     | Use                                    |
| -------------------- | --------- | -------------------------------------- |
| `TextPrimaryBrush`   | `#FFFFFF` | item titles, primary copy              |
| `TextSecondaryBrush` | `#A6A6A6` | subtitles, descriptions, footer labels |
| `TextTertiaryBrush`  | `#797979` | section count badges, empty-view copy  |
| `AccentBrush`        | `#4F8CFF` | toggles, focus, interactive accents    |

### Type sizes

| Resource                                            | Value                                  | Use                                                                      |
| --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `AppFontFamily`                                     | Inter (bundled)                        | everything                                                               |
| `GlyphFontFamily`                                   | Segoe Fluent Icons                     | shell glyphs only — extensions use lucide names/emoji, never glyph fonts |
| `SearchFontSize` 16                                 | `TitleFontSize`/`SecondaryFontSize` 14 | search box; titles                                                       |
| `KindFontSize` 13 / `FooterFontSize` 13             | `HeaderFontSize` 12                    | kind labels, footer; section headers                                     |
| `KeycapFontSize` 11 / `EmptyDescriptionFontSize` 13 |                                        | keycaps; empty views                                                     |

### Shape

`WindowCornerRadius` 10 · `CellCornerRadius` 10 · `RowCornerRadius` 8 ·
`IconTileCornerRadius` 6 · `KeycapCornerRadius` 5. Icon tiles: `IconTileSize`
28 with `IconTileIconSize` 16.

## 2. The three view types (extension UI trees)

Extensions serialize one of three trees; the shell renders each natively:

| Tree     | Rendered as                                                                                        | Extension components                                                                                |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `list`   | rows with optional side pane (`layout: "side-pane"`), section headers, per-item pane metadata      | `<List>`, `<List.Section>`, `<List.Item>`, `<List.Item.Detail>`, `<List.EmptyView>`                 |
| `grid`   | virtualized cell grid (`columns`), section header rows (title + gray count), per-cell tinted icons | `<Grid>`, `<Grid.Section>`, `<Grid.Item>`, `<Grid.EmptyView>`, `filter` for the search-bar dropdown |
| `detail` | title, subtitle, image, key-value fields, markdown description, actions                            | `<Detail>`, `<Detail.Metadata>`, `<Detail.Metadata.Field>`                                          |

Rules:

- **Every item carries at least one action; the intended default is marked
  `primary`** — the footer shows its title next to the ↵ keycap, and Enter
  runs it. The `Ctrl+K` action panel lists the rest.
- Icons: strings are emoji; `{ lucide, color }` resolves a name from the
  shell's curated Lucide set; `{ svg, color }` renders arbitrary SVG content
  tinted by the color; `{ uri }` is a file/data URI. Never invent a fourth
  channel — extend `IconSpec` generically if needed.
- Empty states: always provide an `EmptyView` with a short title; add a
  `description` when the empty state is conditional (e.g. no search matches).
- Stale-response discipline is shell-side; extensions just re-render from
  props — never hand-build `uiPush` bookkeeping in an extension.

## 3. Layout

- Launcher window: search box on top, content row, footer bar. Section
  headers use `HeaderFontSize` + `HeaderMargin`; the footer shows the primary
  action + ↵ keycap + "Actions" hint.
- Grids: columns come from the extension (lucide-icons uses 8); the shell
  clamps cell size (48–160 px) to fit width. Cell = square tile + 12px title
  - 11px subtitle under it.
- Spacing in XAML uses `DynamicResource` margins (`CellMargin`,
  `HeaderMargin`, `FooterLeftPadding`, …) — same rule as colors.
- Settings pages: `SettingsRow(label, description, control)` rows, section
  headers via `SectionTitle`, forms built in code-behind helpers — reuse
  them, don't hand-roll new row styles.

## 4. Motion

- `Rendering/SmoothScroll` enables smooth wheel scrolling on list and grid —
  keep the attached property when creating new scroll hosts.
- Loading feedback is the shell's loading bar (operation counter), not
  per-view spinners; HUD (`hud.show`) is the extension feedback channel for
  completed actions (copied, saved, …).

## 5. When nothing fits

Do not invent a new surface, brush, or view type ad hoc. Either compose from
the existing three trees and theme resources, or propose a generic extension
(through `architectural-integrity`) — a new UI primitive must serve any
extension and ride the contract fixture discipline.
