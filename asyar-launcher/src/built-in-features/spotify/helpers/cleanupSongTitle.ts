/**
 * Removes extra information from song titles such as anything after the first
 * hyphen (surrounded by spaces), parenthesis, bracket, or "feat." — unless the
 * title starts with one of those. Ported from the Raycast spotify-player
 * extension so lyrics lookups match on the bare song name.
 */
export function cleanupSongTitle(inputString: string): string {
  const lower = inputString.toLowerCase().trim();
  if (
    inputString.charAt(0) === '(' ||
    inputString.charAt(0) === '[' ||
    lower.startsWith('feat.') ||
    lower.startsWith('ft.') ||
    lower.startsWith('featuring')
  ) {
    return inputString;
  }

  const firstOpeningParenthesisIndex = inputString.indexOf('(');
  const firstOpeningBracketIndex = inputString.indexOf('[');

  const spacedHyphenIndex = inputString.indexOf(' - ');

  const featMatch = inputString.match(/(\s+|\()(feat\.|ft\.|featuring)(\s|\))/i);
  const featIndex = featMatch ? featMatch.index! : -1;

  const index = Math.min(
    firstOpeningParenthesisIndex !== -1 ? firstOpeningParenthesisIndex : Infinity,
    firstOpeningBracketIndex !== -1 ? firstOpeningBracketIndex : Infinity,
    spacedHyphenIndex !== -1 ? spacedHyphenIndex : Infinity,
    featIndex !== -1 ? featIndex : Infinity,
  );

  return index !== Infinity ? inputString.slice(0, index).trim() : inputString;
}
