import { useEffect, useRef, useState } from 'react';
import {
  getAvailableDevices,
  loadSdk,
  pausePlayback,
  playTrack,
  transferPlayback,
  type SpotifyDevice,
  type SpotifyPlayer,
} from '../lib/spotifyPlayer';
import { getValidSpotifyAccessToken, signInWithSpotify } from '../lib/spotifyAuth';
import { useAppStore } from '../store/appStore';

interface PlayerState {
  ready: boolean;
  deviceId: string | null;
  playing: boolean;
  currentTrackId: string | null;
  error: string | null;
}

const INITIAL_PLAYER_STATE: PlayerState = {
  ready: false,
  deviceId: null,
  playing: false,
  currentTrackId: null,
  error: null,
};

const DEVICE_RETRY_WAIT_MS = 450;
const DEVICE_POLL_ATTEMPTS = 8;
const PLAYBACK_RETRY_ATTEMPTS = 3;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useSpotifyPlayer() {
  const user = useAppStore((s) => s.user);
  const accessToken = useAppStore((s) => s.auth?.accessToken);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const activatedRef = useRef(false);
  const [state, setState] = useState<PlayerState>(INITIAL_PLAYER_STATE);

  useEffect(() => {
    if (!user?.isPremium) {
      setState(INITIAL_PLAYER_STATE);
      return;
    }

    if (!accessToken) {
      setState({ ...INITIAL_PLAYER_STATE, error: 'Spotify 토큰이 없어요. 재로그인 해주세요.' });
      return;
    }

    let cancelled = false;
    setState(INITIAL_PLAYER_STATE);

    loadSdk().then(async () => {
      if (cancelled) return;

      const player = new window.Spotify.Player({
        name: 'Sorter Web Player',
        getOAuthToken: (cb) => {
          void getValidSpotifyAccessToken(accessToken).then((token) => {
            if (token) cb(token);
          });
        },
        volume: 0.7,
      });

      player.addListener('ready', (data: unknown) => {
        const { device_id } = data as { device_id: string };
        if (!cancelled) {
          setState((s) => ({ ...s, ready: true, deviceId: device_id, error: null }));
        }
      });

      player.addListener('not_ready', () => {
        if (!cancelled) setState((s) => ({ ...s, ready: false, deviceId: null }));
      });

      player.addListener('player_state_changed', (data: unknown) => {
        if (!data || cancelled) return;
        const ps = data as { paused: boolean; track_window: { current_track: { id: string } } };
        setState((s) => ({
          ...s,
          playing: !ps.paused,
          currentTrackId: ps.track_window?.current_track?.id ?? null,
          error: null,
        }));
      });

      player.addListener('autoplay_failed', () => {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: '브라우저 자동재생 제한으로 Web Player가 바로 시작되지 않았어요. 재생 버튼을 한 번 더 눌러주세요.',
          }));
        }
      });

      player.addListener('playback_error', (data: unknown) => {
        const { message } = data as { message?: string };
        if (!cancelled && message) {
          setState((s) => ({ ...s, error: message }));
        }
      });

      player.addListener('initialization_error', (data: unknown) => {
        const { message } = data as { message: string };
        if (!cancelled) setState((s) => ({ ...s, error: message }));
      });

      player.addListener('authentication_error', (data: unknown) => {
        const { message } = data as { message?: string };
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: message?.includes('scope')
              ? 'Spotify 재생 권한 범위(scope)가 부족해요. Spotify 다시 로그인 후 다시 시도해주세요.'
              : '재생 인증 실패. Spotify 다시 로그인 해주세요.',
          }));
        }
      });

      player.addListener('account_error', () => {
        if (!cancelled) setState((s) => ({ ...s, error: 'Spotify Premium 계정에서만 전곡 재생이 가능해요.' }));
      });

      const connected = await player.connect().catch(() => false);
      if (!cancelled && !connected) {
        setState((s) => ({ ...s, error: 'Spotify Web Player 연결에 실패했어요.' }));
      }
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      activatedRef.current = false;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [accessToken, user?.isPremium]);

  async function activatePlayerElement() {
    if (!playerRef.current?.activateElement || activatedRef.current) return;
    await playerRef.current.activateElement();
    activatedRef.current = true;
  }

  async function findDevice(
    token: string,
    deviceId: string,
    predicate: (device: SpotifyDevice) => boolean,
  ) {
    for (let attempt = 0; attempt < DEVICE_POLL_ATTEMPTS; attempt += 1) {
      const devices = await getAvailableDevices(token);
      const targetDevice = devices.find((device) => device.id === deviceId && !device.is_restricted);
      if (targetDevice && predicate(targetDevice)) {
        return targetDevice;
      }

      await playerRef.current?.connect().catch(() => false);
      await wait(DEVICE_RETRY_WAIT_MS);
    }

    return undefined;
  }

  async function ensurePlaybackDevice(token: string, deviceId: string) {
    await activatePlayerElement();

    const availableDevice = await findDevice(token, deviceId, () => true);
    if (!availableDevice) {
      throw new Error('재생 장치를 찾지 못했어요. Spotify 앱/브라우저에서 재생 대상을 다시 선택해주세요.');
    }

    if (!availableDevice.is_active) {
      await transferPlayback(deviceId, token, true);
    }

    const activeDevice = await findDevice(token, deviceId, (device) => device.is_active);
    if (!activeDevice) {
      throw new Error('Spotify Web Player 장치를 활성화하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  async function pauseCurrent() {
    const token = await getValidSpotifyAccessToken(accessToken);
    if (!token) return;

    try {
      await pausePlayback(token, state.deviceId ?? undefined);
      setState((s) => ({ ...s, playing: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '일시정지 오류';
      setState((s) => ({ ...s, error: message }));
    }
  }

  async function togglePlay(spotifyTrackId: string) {
    const token = await getValidSpotifyAccessToken(accessToken);
    const deviceId = state.deviceId;
    if (!token || !deviceId) return;

    try {
      await activatePlayerElement();

      if (state.playing && state.currentTrackId === spotifyTrackId) {
        await pauseCurrent();
        return;
      }

      await ensurePlaybackDevice(token, deviceId);

      let lastError: unknown;
      for (let attempt = 0; attempt < PLAYBACK_RETRY_ATTEMPTS; attempt += 1) {
        try {
          await playTrack(spotifyTrackId, deviceId, token);
          setState((s) => ({ ...s, error: null }));
          return;
        } catch (error) {
          lastError = error;
          await ensurePlaybackDevice(token, deviceId);
          await wait(DEVICE_RETRY_WAIT_MS);
        }
      }

      throw lastError ?? new Error('재생 오류');
    } catch (error) {
      const message = error instanceof Error ? error.message : '재생 오류';
      setState((s) => ({
        ...s,
        error: message.includes('scope')
          ? 'Spotify 재생 권한이 부족해요. Spotify 다시 로그인 후 다시 시도해주세요.'
          : message,
      }));
    }
  }

  async function relogin() {
    await signInWithSpotify();
  }

  return { ...state, togglePlay, pauseCurrent, relogin };
}
