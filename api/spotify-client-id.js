const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-state',
  'streaming',
  'user-modify-playback-state',
].join(' ');

export default async function handler(request, response) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return response.status(500).json({ error: 'Missing VITE_SUPABASE_URL.' });
  }

  const redirectUri = typeof request.query.redirect_uri === 'string'
    ? request.query.redirect_uri
    : process.env.VITE_SUPABASE_REDIRECT_TO
      ? `${process.env.VITE_SUPABASE_REDIRECT_TO.replace(/\/$/, '')}/auth/callback`
      : undefined;

  if (!redirectUri) {
    return response.status(400).json({ error: 'Missing redirect_uri.' });
  }

  const authorizeUrl = new URL('/auth/v1/authorize', supabaseUrl);
  authorizeUrl.searchParams.set('provider', 'spotify');
  authorizeUrl.searchParams.set('redirect_to', redirectUri);
  authorizeUrl.searchParams.set('scopes', SPOTIFY_SCOPES);

  try {
    const upstream = await fetch(authorizeUrl, { redirect: 'manual' });
    const location = upstream.headers.get('location');
    if (!location) {
      return response.status(502).json({ error: 'Supabase authorize redirect missing.' });
    }

    const spotifyUrl = new URL(location);
    const clientId = spotifyUrl.searchParams.get('client_id');
    if (!clientId) {
      return response.status(502).json({ error: 'Spotify client_id missing from redirect.' });
    }

    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return response.status(200).json({ clientId });
  } catch (error) {
    return response.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to derive Spotify client id.',
    });
  }
}
