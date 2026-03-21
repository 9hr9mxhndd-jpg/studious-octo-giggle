import { demoPlaylists, demoSongs } from './sampleData';
import type { PlaylistSummary, Song, SpotifyProduct } from '../types';

const API_ROOT = 'https://api.spotify.com/v1';
const FALLBACK_PLAYLIST_IMAGE = 'https://picsum.photos/seed/playlist/300/300';
const FALLBACK_TRACK_IMAGE = 'https://picsum.photos/seed/track/300/300';
const playlistRequestCache = new Map<string, Promise<PlaylistSummary[]>>();

interface SpotifyImage {
  url?: string | null;
}

interface SpotifyArtist {
  name?: string | null;
}

interface SpotifyTrack {
  id?: string | null;
  name?: string | null;
  preview_url?: string | null;
  duration_ms?: number | null;
  album?: {
    name?: string | null;
    images?: SpotifyImage[] | null;
  } | null;
  artists?: SpotifyArtist[] | null;
}

interface SpotifyPlaylistItem {
  id?: string;
  name?: string;
  description?: string | null;
  images?: SpotifyImage[] | null;
  tracks?: {
    href?: string | null;
    total?: number | null;
  } | null;
}

async function getPlaylistTrackCount(playlist: SpotifyPlaylistItem, accessToken: string): Promise<number> {
  if (typeof playlist.tracks?.total === 'number' && playlist.tracks.total > 0) {
    return playlist.tracks.total;
  }

  if (!playlist.tracks?.href) {
    return playlist.tracks?.total ?? 0;
  }

  try {
    const payload = await spotifyFetch<SpotifyPagingResponse<unknown>>(playlist.tracks.href, accessToken);
    return payload.total ?? playlist.tracks.total ?? 0;
  } catch {
    return playlist.tracks?.total ?? 0;
  }
}

interface SpotifyPagingResponse<T> {
  items?: T[];
  next?: string | null;
  total?: number | null;
}

async function spotifyFetch<T>(path: string, accessToken: string): Promise<T> {
  const requestUrl = path.startsWith('http') ? path : `${API_ROOT}${path}`;
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After');
    const message = response.status === 401
      ? 'Spotify session expired. Please sign in again.'
      : response.status === 403
        ? 'Spotify denied access to this resource. Check your Spotify scopes and Supabase redirect settings.'
        : response.status === 429
          ? `Spotify rate limit reached.${retryAfter ? ` Try again in ${retryAfter} seconds.` : ''}`
          : `Spotify request failed with ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function normalizeTrack(track: SpotifyTrack, playlistId: string, index: number): Song | undefined {
  if (!track.id || !track.name) {
    return undefined;
  }

  return {
    id: `${playlistId}-${track.id}-${index}`,
    spotifyTrackId: track.id,
    playlistId,
    title: track.name,
    artist: (track.artists ?? []).map((artist) => artist.name).filter((name): name is string => Boolean(name)).join(', ') || 'Unknown artist',
    album: track.album?.name ?? 'Unknown album',
    imageUrl: track.album?.images?.[0]?.url || FALLBACK_TRACK_IMAGE,
    previewUrl: track.preview_url ?? undefined,
    durationMs: track.duration_ms ?? 0,
    uncertain: false,
  };
}

export async function getSpotifyProduct(accessToken?: string): Promise<SpotifyProduct> {
  if (!accessToken) {
    return 'unknown';
  }

  try {
    const me = await spotifyFetch<{ product?: SpotifyProduct }>('/me', accessToken);
    return me.product ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function getUserPlaylists(accessToken?: string): Promise<PlaylistSummary[]> {
  if (!accessToken) {
    return demoPlaylists;
  }

  const cachedRequest = playlistRequestCache.get(accessToken);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = spotifyFetch<SpotifyPagingResponse<SpotifyPlaylistItem>>(
    '/me/playlists?limit=50&fields=items(id,name,description,images(url),tracks(total,href)),next,total',
    accessToken,
  )
    .then(async (payload) => Promise.all(
      (payload.items ?? [])
        .filter((playlist): playlist is SpotifyPlaylistItem & { id: string; name: string } => Boolean(playlist?.id && playlist.name))
        .map(async (playlist) => ({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description?.trim() || 'No playlist description',
          imageUrl: playlist.images?.[0]?.url || FALLBACK_PLAYLIST_IMAGE,
          trackCount: await getPlaylistTrackCount(playlist, accessToken),
        })),
    ))
    .catch((error) => {
      playlistRequestCache.delete(accessToken);
      throw error;
    });

  playlistRequestCache.set(accessToken, request);
  return request;
}

export async function importPlaylistTracks(playlistId: string, accessToken?: string): Promise<Song[]> {
  if (!accessToken) {
    return demoSongs.filter((song) => song.playlistId === playlistId || playlistId.startsWith('demo-'));
  }

  const payload = await spotifyFetch<SpotifyPagingResponse<{ track?: SpotifyTrack | null }>>(
    `/playlists/${playlistId}/tracks?limit=100`,
    accessToken,
  );

  return (payload.items ?? [])
    .map((item, index) => item.track ? normalizeTrack(item.track, playlistId, index) : undefined)
    .filter((song): song is Song => Boolean(song));
}

export function loadSpotifySdk(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if ((window as Window & { Spotify?: unknown }).Spotify) {
    return Promise.resolve(true);
  }

  const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://sdk.scdn.co/spotify-player.js"]');
  if (existingScript) {
    return new Promise((resolve) => {
      existingScript.addEventListener('load', () => resolve(true), { once: true });
      existingScript.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
