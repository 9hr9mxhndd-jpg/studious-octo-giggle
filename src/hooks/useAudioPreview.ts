import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../types';

export function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      setPlayingSongId(null);
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audioRef.current = null;
    setPlayingSongId(null);
  }, []);

  const togglePreview = useCallback(async (song: Song) => {
    if (!song.previewUrl) return;

    const currentAudio = audioRef.current;
    if (currentAudio && playingSongId === song.id) {
      stopPreview();
      return;
    }

    stopPreview();

    const nextAudio = new Audio(song.previewUrl);
    nextAudio.onended = () => {
      audioRef.current = null;
      setPlayingSongId(null);
    };

    audioRef.current = nextAudio;
    setPlayingSongId(song.id);

    try {
      await nextAudio.play();
    } catch {
      audioRef.current = null;
      setPlayingSongId(null);
    }
  }, [playingSongId, stopPreview]);

  useEffect(() => stopPreview, [stopPreview]);

  return {
    playingSongId,
    stopPreview,
    togglePreview,
  };
}
