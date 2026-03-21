import { useMemo, useState } from 'react';

import { useAppStore } from '../store/appStore';

export function RankingPage() {
  const songs = useAppStore((s) => s.songs);
  const ratings = useAppStore((s) => s.ratings);
  const matches = useAppStore((s) => s.matches);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'elo' | 'elo-asc' | 'comps' | 'alpha'>('elo');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const top1 = useMemo(() => {
    const rated = songs.map((s) => ({ song: s, r: ratings[s.id] })).filter((x) => x.r);
    rated.sort((a, b) => b.r.rating - a.r.rating);
    return rated[0]?.song;
  }, [songs, ratings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = songs
      .map((s) => ({ song: s, rating: ratings[s.id] }))
      .filter((x): x is { song: typeof x.song; rating: NonNullable<typeof x.rating> } => Boolean(x.rating))
      .filter(({ song }) => !q || `${song.title} ${song.artist}`.toLowerCase().includes(q));

    if (sortBy === 'elo') list.sort((a, b) => b.rating.rating - a.rating.rating);
    else if (sortBy === 'elo-asc') list.sort((a, b) => a.rating.rating - b.rating.rating);
    else if (sortBy === 'comps') list.sort((a, b) => b.rating.matchesPlayed - a.rating.matchesPlayed);
    else list.sort((a, b) => a.song.title.localeCompare(b.song.title));

    return list;
  }, [songs, ratings, query, sortBy]);

  const globalRank = useMemo(() => {
    const sorted = [...songs].map((s) => ({ id: s.id, r: ratings[s.id]?.rating ?? 0 }));
    sorted.sort((a, b) => b.r - a.r);
    return Object.fromEntries(sorted.map((x, i) => [x.id, i + 1]));
  }, [songs, ratings]);

  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, maxPage);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // tier 구분선 (elo 정렬 + 검색 없을 때)
  const showDividers = sortBy === 'elo' && !query.trim();

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="text-center pt-2 pb-1 border-b border-warm-200">
        <p className="text-3xl mb-1.5">🏆</p>
        <h1 className="font-display text-2xl text-warm-800 tracking-tight">내 음악 랭킹</h1>
        <p className="mt-1 text-xs text-warm-400">{songs.length}곡 · {matches.length}회 비교 완료</p>
        <div className="mt-3 flex justify-center gap-5">
          {[
            { val: matches.length, label: '총 비교' },
            { val: new Set(matches.map((m) => [m.leftSongId, m.rightSongId].sort().join('|'))).size, label: '고유 쌍' },
            { val: top1?.title ?? '—', label: '1위' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-base font-medium text-warm-800 max-w-[90px] truncate">{stat.val}</p>
              <p className="text-[10px] text-warm-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-warm-400">⌕</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="곡 / 아티스트 검색..."
            className="w-full rounded-xl border border-warm-200 bg-white py-2 pl-7 pr-3 text-xs text-warm-800 placeholder-warm-300 focus:border-warm-400 focus:outline-none"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
          className="rounded-xl border border-warm-200 bg-white px-2.5 py-2 text-xs text-warm-500 focus:outline-none"
        >
          <option value="elo">Elo 높은 순</option>
          <option value="elo-asc">Elo 낮은 순</option>
          <option value="comps">비교 많은 순</option>
          <option value="alpha">이름순</option>
        </select>
      </div>

      {/* 리스트 */}
      <div className="overflow-hidden rounded-2xl border border-warm-200">
        {slice.length === 0 ? (
          <div className="p-8 text-center text-xs text-warm-400">결과 없음</div>
        ) : (
          slice.map(({ song, rating }, i) => {
            const rank = globalRank[song.id];
            const numCls = rank === 1 ? 'text-amber-500 text-base' : rank === 2 ? 'text-warm-500 text-sm' : rank === 3 ? 'text-orange-700 text-sm' : 'text-warm-300 text-xs';
            const prevSong = i > 0 ? slice[i - 1].song : null;
            const showDiv = showDividers && prevSong && prevSong.tier !== song.tier && song.tier !== undefined;
            const divLabel = song.tier === 2 ? 'T2 보통' : song.tier === 3 ? 'T3 기타' : null;
            return (
              <div key={song.id}>
                {showDiv && divLabel && (
                  <div className="flex items-center gap-2 border-b border-warm-200 bg-warm-50 px-4 py-1.5">
                    <div className="h-px flex-1 bg-warm-200" />
                    <span className="text-[10px] font-medium text-warm-400">{divLabel}</span>
                    <div className="h-px flex-1 bg-warm-200" />
                  </div>
                )}
                <div className="flex items-center gap-3 border-b border-warm-100 px-4 py-2.5 last:border-b-0 hover:bg-warm-50">
                  <span className={`min-w-[22px] text-right font-display ${numCls}`}>{rank}</span>
                  {song.imageUrl ? (
                    <img src={song.imageUrl} alt={song.title} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warm-100 text-sm">🎵</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-warm-800">{song.title}</p>
                    <p className="truncate text-[10px] text-warm-400">{song.artist}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-warm-800">{Math.round(rating.rating)}</p>
                    <p className="text-[9px] text-warm-400">{rating.matchesPlayed}회</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="rounded-full border border-warm-200 px-3 py-1.5 text-xs text-warm-500 disabled:opacity-30 hover:text-warm-700"
        >
          ← 이전
        </button>
        <span className="text-xs text-warm-400">{currentPage} / {maxPage}</span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          disabled={currentPage >= maxPage}
          className="rounded-full border border-warm-200 px-3 py-1.5 text-xs text-warm-500 disabled:opacity-30 hover:text-warm-700"
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
