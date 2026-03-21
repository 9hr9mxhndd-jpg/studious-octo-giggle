import { getCopy } from '../lib/i18n';
import { useAppStore } from '../store/appStore';
import type { PlaylistSummary } from '../types';

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  selected: boolean;
  onSelect: (playlistId: string) => void;
}

export function PlaylistCard({ playlist, selected, onSelect }: PlaylistCardProps) {
  const copy = getCopy(useAppStore((state) => state.locale));

  return (
    <button
      type="button"
      onClick={() => onSelect(playlist.id)}
      className={`overflow-hidden rounded-3xl border text-left transition ${
        selected ? 'border-brand-400 bg-brand-500/10 shadow-glow' : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className="relative">
        <img src={playlist.imageUrl} alt={playlist.name} className="h-56 w-full object-cover" />
        {playlist.isLikedSongs ? (
          <span className="absolute left-4 top-4 rounded-full bg-slate-950/80 px-3 py-1 text-sm font-medium text-white">
            ♥
          </span>
        ) : null}
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{playlist.name}</h3>
            <p className="mt-1 text-sm text-slate-300">{playlist.description}</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">{playlist.trackCount} {copy.playlist.trackCount}</span>
        </div>
        <div className="text-sm text-brand-300">{selected ? copy.playlist.cardSelected : copy.playlist.cardIdle}</div>
      </div>
    </button>
  );
}
