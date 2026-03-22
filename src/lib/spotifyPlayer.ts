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

// ── SDK 로드 (중복 방지) ──
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
  const text = await res.text().catch(() => '');
  return text;
}

export async function getAvailableDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await parseError(res);
    throw new Error(`장치 조회 실패 (${res.status}): ${text}`);
  }

  const data = await res.json() as { devices?: SpotifyDevice[] };
  return data.devices ?? [];
}

export async function transferPlayback(
  deviceId: string,
  accessToken: string,
  play = false,
): Promise<void> {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });

  if (!res.ok && res.status !== 204) {
    const text = await parseError(res);
    throw new Error(`장치 전환 실패 (${res.status}): ${text}`);
  }
}

// ── 특정 트랙을 device에서 재생 ──
export async function playTrack(
  spotifyTrackId: string,
  deviceId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [`spotify:track:${spotifyTrackId}`] }),
    },
  );

  if (!res.ok && res.status !== 204) {
    const text = await parseError(res);
    throw new Error(`재생 실패 (${res.status}): ${text}`);
  }
}

// ── 재생 일시정지 ──
export async function pausePlayback(accessToken: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type { SpotifyDevice, SpotifyPlayer, SpotifyPlayerState };
