import { useCallback, useMemo } from 'react';
import { useAudioPreview } from './useAudioPreview';
import { useSpotifyPlayer } from './useSpotifyPlayer';
import type { Song } from '../types';

interface UseSongPlaybackArgs {
  isPremium: boolean;
}

export function useSongPlayback({ isPremium }: UseSongPlaybackArgs) {
  const spotify = useSpotifyPlayer();
  const preview = useAudioPreview();

  const playSong = useCallback(async (song: Song) => {
    if (isPremium) {
      await spotify.togglePlay(song.spotifyTrackId);
      return;
    }

    await preview.togglePreview(song);
  }, [isPremium, preview.togglePreview, spotify.togglePlay]);

  const stopPlayback = useCallback(async () => {
    if (isPremium) {
      await spotify.pauseCurrent();
      return;
    }

    preview.stopPreview();
  }, [isPremium, preview.stopPreview, spotify.pauseCurrent]);

  const requiresRelogin = Boolean(
    spotify.error && (spotify.error.includes('재생 권한') || spotify.error.includes('재로그인') || spotify.error.includes('scope') || spotify.error.includes('토큰')),
  );

  const statusMessage = useMemo(() => {
    if (!isPremium) return null;
    if (spotify.error) return spotify.error;
    if (spotify.ready) return `Web Player 연결됨 · 전곡 재생 가능${spotify.playing ? ' · 재생 중' : ''}`;
    return 'Web Player 연결 중…';
  }, [isPremium, spotify.error, spotify.playing, spotify.ready]);

  function isSongPlaying(song: Song | undefined) {
    if (!song) return false;
    return isPremium
      ? spotify.playing && spotify.currentTrackId === song.spotifyTrackId
      : preview.playingSongId === song.id;
  }

  function canPlaySong(song: Song | undefined) {
    if (!song) return false;
    return isPremium ? spotify.ready : Boolean(song.previewUrl);
  }

  return {
    ready: spotify.ready,
    error: spotify.error,
    requiresRelogin,
    statusMessage,
    playSong,
    stopPlayback,
    isSongPlaying,
    canPlaySong,
    relogin: spotify.relogin,
  };
}
