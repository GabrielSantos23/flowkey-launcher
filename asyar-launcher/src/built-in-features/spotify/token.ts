import { spotifyAuth } from './spotifyAuth';

/** Convenience for views: a usable token or a thrown setup error. */
export async function token(): Promise<string> {
  const t = await spotifyAuth.getValidToken();
  if (!t) throw new Error('Spotify is not connected');
  return t;
}
