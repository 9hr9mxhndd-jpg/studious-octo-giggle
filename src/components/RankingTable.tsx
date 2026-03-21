import { convergenceFromMatches } from '../lib/elo';
import { getCopy } from '../lib/i18n';
import { useAppStore } from '../store/appStore';
import type { RatingRecord, Song, Tier } from '../types';

interface RankingTableProps {
  songs: Song[];
  ratings: Record<string, RatingRecord>;
  filterTier: Tier | 'all';
  query: string;
}

export function RankingTable({ songs, ratings, filterTier, query }: RankingTableProps) {
  const copy = getCopy(useAppStore((state) => state.locale));
  const normalized = query.trim().toLowerCase();
  const rows = songs
    .filter((song) => (filterTier === 'all' ? true : song.tier === filterTier))
    .filter((song) => {
      if (!normalized) {
        return true;
      }
      return `${song.title} ${song.artist} ${song.album}`.toLowerCase().includes(normalized);
    })
    .map((song) => ({ song, rating: ratings[song.id] }))
    .filter((row): row is { song: Song; rating: RatingRecord } => Boolean(row.rating))
    .sort((a, b) => b.rating.rating - a.rating.rating);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead className="bg-white/5 text-slate-300">
          <tr>
            <th className="px-5 py-4 font-medium">{copy.ranking.rank}</th>
            <th className="px-5 py-4 font-medium">{copy.ranking.song}</th>
            <th className="px-5 py-4 font-medium">{copy.ranking.tier}</th>
            <th className="px-5 py-4 font-medium">{copy.ranking.elo}</th>
            <th className="px-5 py-4 font-medium">{copy.ranking.convergence}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map(({ song, rating }, index) => {
            const convergence = convergenceFromMatches(rating.matchesPlayed);
            const convergenceLabel =
              copy.ranking.convergence === '수렴도'
                ? convergence.label === 'Stable'
                  ? '안정적'
                  : convergence.label === 'Settling'
                    ? '수렴 중'
                    : '학습 중'
                : convergence.label;
            return (
              <tr key={song.id} className="text-slate-200">
                <td className="px-5 py-4 text-white">#{index + 1}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <img src={song.imageUrl} alt={song.title} className="h-12 w-12 rounded-xl object-cover" />
                    <div>
                      <div className="font-medium text-white">{song.title}</div>
                      <div className="text-slate-400">{song.artist}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">{copy.ranking.tier} {song.tier ?? '—'}</td>
                <td className="px-5 py-4">{rating.rating}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-brand-400" style={{ width: `${convergence.value}%` }} />
                    </div>
                    <span>{convergenceLabel}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
