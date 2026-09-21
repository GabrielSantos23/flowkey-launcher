# FlowKey native shell — design backlog

Out-of-scope items from the Phase D design gate (Raycast reference), recorded
with their contract implications. None of these are implemented; each needs a
design decision before any contract work starts.

## Side detail pane (reference screenshot 3)

List on the left, rendered detail on the right, plus a type-filter dropdown in
the search bar ("All Types").

Contract implications:

- A side pane needs the shell to render TWO trees at once (list level + detail
  tree for the selected row). Today a `ui` message replaces the whole level.
  Additive option: a `detail` field on `ListTree` (or a new `pane` message)
  carrying the DetailTree for the current selection, delivered alongside the
  list. Alternatively the shell could drive it with an automatic `action` per
  selection change — more traffic, no contract change, worse latency.
- The type filter needs the extension to declare the filter facets
  (e.g., `ListTree.filter?: { name, options }`) or the shell derives them from
  a new per-item `kind` field (same field the kind label needs).

## Calculator result card and "Use ... with" fallback (reference screenshot 4)

A rich result card above the list, and a fallback section ("Use 123 + 456
with…") listing commands that can handle the query.

Contract implications:

- A result card is a new top-level tree region (e.g., optional `card` field on
  ListTree) with its own item shape — additive but a real protocol surface.
- The fallback section is expressible with existing `sections`, but populating
  it requires cross-extension query fan-out with per-extension "can handle"
  declarations — a manifest capability (`handlesQuery`) plus ranking policy in
  the shell.

## "Quick AI" / "Ask AI" hint

Requires an AI backend and a Tab-to-AI handoff flow. No contract today;
would need a built-in host command and a preferences schema for provider
configuration.

## Pro badge

Requires a monetization/licensing concept that does not exist in FlowKey.
No contract implication until that exists.

## Favorites and Suggestions sections

Both are shell-side ranking concerns (usage store + pinned list), consistent
with the Rust-first principle applied to the C# shell (shell owns ranking).
The list contract already supports arbitrary sections; no protocol change is
required for rendering. Pinning UI would need an action contract (e.g., a
reserved `__pin__` id) — decide at design time.

## Translucency (red tint in reference screenshots 2–4)

Appears to be a wallpaper behind a translucent backdrop, not a theme color.
Default stays the solid dark look of reference screenshot 1. If translucency
is ever wanted, it is shell-only (DWM backdrop types), no contract impact,
and ships behind a preference, off by default, only if the measured memory
cost stays small (see docs/shell-comparison.md gate measurements).
