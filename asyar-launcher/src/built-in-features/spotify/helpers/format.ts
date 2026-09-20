/** Format milliseconds as `m:ss` (hours prepended when present). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Join artist names the way Spotify displays them. */
export function artistNames(artists: { name: string }[]): string {
  return artists.map((a) => a.name).join(', ');
}

/** open.spotify.com link for a track URI (`spotify:track:<id>` → URL). */
export function trackUrl(uri: string): string {
  const id = uri.split(':').pop() ?? '';
  return `https://open.spotify.com/track/${id}`;
}
