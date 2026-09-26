# Lucide Icons

Search the [Lucide](https://lucide.dev) icon set inside FlowKey — a port of the
Raycast extension, built on the FlowKey SDK.

- **Grid view** with 8 columns and live search over icon names and keywords.
- **Color dropdown** in the search bar tints every icon (PrimaryText, Red,
  Blue, …).
- **Actions** per icon: Copy Name (with optional Pascal case preference),
  Copy SVG, Paste SVG, Copy Component (`<IconName />`), Open In Browser — the
  primary action is configurable in the extension preferences.

The full icon metadata (names, keywords, SVG markup) is bundled with the
extension (`src/generated/`, regenerated with `pnpm --dir flowkey-native
icons:sync` from the `lucide-static` package), so it works completely
offline. Icons render as generic SVG content through the SDK's
`icon={{ svg, color }}` support — no host-side icon registration involved.
