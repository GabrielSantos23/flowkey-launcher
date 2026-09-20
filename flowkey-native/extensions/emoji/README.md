# Emoji (flowkey-native model)

Picker extension for the native shell: keyword search over emoji, symbols and
kaomoji, grouped into sections, with a `copy` action that requests the host's
`clipboard.write` native method.

## Data provenance

`src/data/emoji.json`, `symbols.json` and `kaomoji.json` are copied verbatim
from the Asyar dogfood extension `extensions/emoji/src/data/` (gitignored in
this repository, cloned by `setup.mjs`). Record shape: `char`, `name`,
`shortcode`, `category`, `keywords`, `codepoints`, `htmlEntity` — a format
consistent with a standard emoji keyword dataset (gemoji/emoji-mart style),
but the upstream source is not recorded in the files themselves and could not
be verified from this repository.

**License status: unverified — flagged for follow-up.** Before shipping this
extension outside development, the upstream dataset must be identified and its
license recorded here.
