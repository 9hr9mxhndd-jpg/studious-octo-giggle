import { getCopy } from '../lib/i18n';
import { useAppStore } from '../store/appStore';
import type { Song, Tier } from '../types';

interface TierBucketColumnProps {
  tier: Tier;
  songs: Song[];
  activeSongId?: string;
  onToggleUncertain: (songId: string, uncertain: boolean) => void;
}

export function TierBucketColumn({ tier, songs, activeSongId, onToggleUncertain }: TierBucketColumnProps) {
  const copy = getCopy(useAppStore((state) => state.locale));

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{copy.bucket.tierTitles[tier]}</h3>
        <p className="text-sm text-slate-400">{copy.bucket.tierSubtitles[tier]}</p>
      </div>
      <div className="space-y-3">
        {songs.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">{copy.bucket.emptyBucket}</div> : null}
        {songs.map((song) => (
          <div
            key={song.id}
            className={`rounded-2xl border p-4 transition ${
              activeSongId === song.id ? 'border-brand-400 bg-brand-500/10' : 'border-white/10 bg-slate-900/60'
            }`}
          >
            <div className="flex items-start gap-3">
              <img src={song.imageUrl} alt={song.title} className="h-14 w-14 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white">{song.title}</div>
                <div className="truncate text-sm text-slate-400">{song.artist}</div>
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={song.uncertain}
                    onChange={(event) => onToggleUncertain(song.id, event.target.checked)}
                    className="rounded border-white/10 bg-slate-800"
                  />
                  {copy.bucket.boundaryShort}
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
