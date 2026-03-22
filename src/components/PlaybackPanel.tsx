import { useEffect, useState } from 'react';
import { getCopy } from '../lib/i18n';
import { loadSdk } from '../lib/spotifyPlayer';
import { useAppStore } from '../store/appStore';
import type { Song, UserProfile } from '../types';

interface PlaybackPanelProps {
  user?: UserProfile;
  song: Song;
}

export function PlaybackPanel({ user, song }: PlaybackPanelProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const copy = getCopy(useAppStore((state) => state.locale));

  useEffect(() => {
    if (!user?.isPremium) {
      setSdkReady(false);
      return;
    }

    let cancelled = false;

    void loadSdk().then(() => {
      if (!cancelled) {
        setSdkReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.isPremium]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">{copy.playback.title}</h3>
      <p className="mt-2 text-sm text-slate-300">{user?.isPremium ? copy.playback.premium : copy.playback.free}</p>

      {user?.isPremium ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
          {copy.playback.sdkStatus}: {sdkReady ? copy.playback.sdkReady : copy.playback.sdkLoading}.
        </div>
      ) : song.previewUrl ? (
        <audio className="mt-4 w-full" controls src={song.previewUrl}>
          <track kind="captions" />
        </audio>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">{copy.playback.noPreview}</div>
      )}
    </section>
  );
}
