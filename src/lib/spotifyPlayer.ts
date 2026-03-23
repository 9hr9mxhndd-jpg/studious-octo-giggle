declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  activateElement?: () => Promise<void>;
  addListener: (event: string, cb: (state: unknown) => void) => void;
  removeListener: (event: string) => void;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
}

interface SpotifyPlayerState {
  paused: boolean;
  track_window: {
    current_track: { id: string; name: string };
  };
}

interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
}

let sdkPromise: Promise<void> | null = null;

export function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  if (typeof window === 'undefined') return Promise.resolve();

  sdkPromise = new Promise((resolve) => {
    if ((window as Window & { Spotify?: unknown }).Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = resolve;

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
  });

  return sdkPromise;
}

async function parseError(res: Response) {
  return res.text().catch(() => '');
}

async function spotifyPlayerFetch(input: string, init: RequestInit, accessToken: string) {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const text = await parseError(response);
    throw new Error(`${init.method ?? 'GET'} 실패 (${response.status}): ${text}`);
  }

  return response;
}

export async function getAvailableDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const res = await spotifyPlayerFetch('https://api.spotify.com/v1/me/player/devices', {}, accessToken);
  const data = await res.json() as { devices?: SpotifyDevice[] };
  return data.devices ?? [];
}

export async function transferPlayback(deviceId: string, accessToken: string, play = false): Promise<void> {
  await spotifyPlayerFetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  }, accessToken);
}

export async function playTrack(spotifyTrackId: string, deviceId: string, accessToken: string): Promise<void> {
  await spotifyPlayerFetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [`spotify:track:${spotifyTrackId}`] }),
  }, accessToken);
}

export async function pausePlayback(accessToken: string, deviceId?: string): Promise<void> {
  const url = deviceId
    ? `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`
    : 'https://api.spotify.com/v1/me/player/pause';

  await spotifyPlayerFetch(url, {
    method: 'PUT',
  }, accessToken);
}

export type { SpotifyDevice, SpotifyPlayer, SpotifyPlayerState };
