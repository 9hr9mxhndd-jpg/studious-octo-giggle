import { useEffect, useRef, useState } from 'react';
import { loadSdk, playTrack, pausePlayback, type SpotifyPlayer } from '../lib/spotifyPlayer';
import { loadSpotifyToken } from '../lib/supabase';
import { useAppStore } from '../store/appStore';

interface PlayerState {
  ready: boolean;
  deviceId: string | null;
  playing: boolean;
  currentTrackId: string | null;
  error: string | null;
}

export function useSpotifyPlayer() {
  const user = useAppStore((s) => s.user);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const [state, setState] = useState<PlayerState>({
    ready: false,
    deviceId: null,
    playing: false,
    currentTrackId: null,
    error: null,
  });

  useEffect(() => {
    if (!user?.isPremium) return;

    const token = loadSpotifyToken();
    if (!token) {
      setState((s) => ({ ...s, error: 'Spotify 토큰이 없어요. 재로그인 해주세요.' }));
      return;
    }

    let cancelled = false;

    loadSdk().then(() => {
      if (cancelled) return;

      const player = new window.Spotify.Player({
        name: 'Sorter Web Player',
        getOAuthToken: (cb) => {
          const t = loadSpotifyToken();
          if (t) cb(t);
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
        }));
      });

      player.addListener('initialization_error', (data: unknown) => {
        const { message } = data as { message: string };
        if (!cancelled) setState((s) => ({ ...s, error: message }));
      });

      player.addListener('authentication_error', () => {
        if (!cancelled) setState((s) => ({ ...s, error: '재생 인증 실패. 재로그인 해주세요.' }));
      });

      player.addListener('account_error', () => {
        if (!cancelled) setState((s) => ({ ...s, error: 'Spotify Premium이 필요해요.' }));
      });

      player.connect();
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [user?.isPremium]);

  async function togglePlay(spotifyTrackId: string) {
    const token = loadSpotifyToken();
    if (!token || !state.deviceId) return;

    try {
      if (state.playing && state.currentTrackId === spotifyTrackId) {
        await pausePlayback(token);
      } else {
        await playTrack(spotifyTrackId, state.deviceId, token);
      }
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : '재생 오류' }));
    }
  }

  return { ...state, togglePlay };
}
