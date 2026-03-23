import type { MouseEvent } from 'react';
import type { Song } from '../types';
import { useNavigate } from 'react-router-dom';
import { buildMatchup, getAdaptiveBattleMode } from '../lib/elo';
import { useAppStore } from '../store/appStore';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import { signInWithSpotify } from '../lib/supabase';

const SCALE_STEPS = [
  { label: 'A 훨씬', score: 1.0 },
  { label: 'A 조금', score: 0.7 },
  { label: '비슷', score: 0.5, neutral: true },
  { label: 'B 조금', score: 0.3 },
  { label: 'B 훨씬', score: 0.0 },
];

export function MatchPage() {
  const navigate = useNavigate();
  const songs = useAppStore((s) => s.songs);
  const ratings = useAppStore((s) => s.ratings);
  const matches = useAppStore((s) => s.matches);
  const lastMatchedAt = useAppStore((s) => s.lastMatchedAt);
  const submitMatch = useAppStore((s) => s.submitMatch);
  const user = useAppStore((s) => s.user);

  const { ready, playing, currentTrackId, error: playerError, togglePlay } = useSpotifyPlayer();

  const matchup = buildMatchup(songs, ratings, matches.length, lastMatchedAt);

  if (!matchup) {
    return (
      <div className="rounded-2xl border border-warm-200 bg-white p-8 text-center">
        <p className="text-2xl mb-2">🗂️</p>
        <p className="text-sm font-medium text-warm-800">티어 분류가 필요해요</p>
        <p className="mt-1 text-xs text-warm-400">티어 탭에서 곡을 먼저 분류해주세요</p>
        <button
          type="button"
          onClick={() => navigate('/bucket')}
          className="mt-4 rounded-full bg-warm-800 px-5 py-2.5 text-xs font-medium text-white"
        >
          티어 분류로 →
        </button>
      </div>
    );
  }

  const mode = getAdaptiveBattleMode(matchup.gap);
  const topK = Math.max(10, Math.min(80, Math.round(Math.sqrt(songs.length) * 2)));

  function PlayButton({ song }: { song: Song }) {
    const isThisPlaying = playing && currentTrackId === song.spotifyTrackId;

    const stopCardClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
    };

    if (user?.isPremium) {
      return (
        <button
          type="button"
          onClick={(event) => {
            stopCardClick(event);
            void togglePlay(song.spotifyTrackId);
          }}
          disabled={!ready}
          title={ready ? (isThisPlaying ? '일시정지' : '전곡 재생') : 'Player 연결 중...'}
          className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full border transition
            ${isThisPlaying
              ? 'border-brand-500 bg-brand-500 text-white'
              : ready
                ? 'border-warm-300 text-warm-500 hover:border-warm-500 hover:text-warm-700'
                : 'border-warm-200 text-warm-300 cursor-not-allowed'
            }`}
        >
          {isThisPlaying ? (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <rect x="0" y="0" width="3" height="8"/><rect x="5" y="0" width="3" height="8"/>
            </svg>
          ) : (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
              <polygon points="1,0 9,5 1,10"/>
            </svg>
          )}
        </button>
      );
    }

    // Free: 30초 미리듣기
    if (song.previewUrl) {
      return (
        <button
          type="button"
          onClick={(event) => {
            stopCardClick(event);
            const audio = document.getElementById(`preview-${song.id}`) as HTMLAudioElement | null;
            if (audio) {
              if (audio.paused) void audio.play();
              else audio.pause();
            }
          }}
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full border border-warm-300 text-warm-500 hover:text-warm-700"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
            <polygon points="1,0 9,5 1,10"/>
          </svg>
          <audio id={`preview-${song.id}`} src={song.previewUrl} />
        </button>
      );
    }

    return (
      <span className="shrink-0 text-[11px] text-warm-300" title="미리듣기 없음">🔒</span>
    );
  }

  function MatchCard({
    song,
    rating,
    onSelect,
  }: {
    song: Song;
    rating: number;
    onSelect: () => void;
  }) {
    return (
      <article className="rounded-2xl border border-warm-200 bg-white p-3 transition hover:border-warm-400 hover:-translate-y-0.5">
        <button
          type="button"
          onClick={onSelect}
          className="block w-full text-left"
        >
          {song.imageUrl ? (
            <img src={song.imageUrl} alt={song.title} className="mb-2 aspect-square w-full rounded-xl object-cover" />
          ) : (
            <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-xl bg-warm-100 text-3xl">🎵</div>
          )}
          <p className="truncate text-xs font-medium text-warm-800">{song.title}</p>
          <p className="mb-2 truncate text-[10px] text-warm-400">{song.artist}</p>
        </button>
        <div className="flex items-center justify-between gap-1">
          <span className="rounded-full bg-warm-100 px-1.5 py-0.5 text-[9px] text-warm-500">
            {Math.round(rating)}
          </span>
          <PlayButton song={song} />
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      {/* 진행 바 */}
      <div>
        <div className="flex justify-between text-xs text-warm-400 mb-1">
          <span>{matches.length}회 비교 완료</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
            mode === 'scale'
              ? 'border-blue-300 bg-blue-50 text-blue-600'
              : 'border-warm-200 text-warm-400'
          }`}>
            {mode === 'scale' ? '5단계 모드' : '이진 모드'}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-warm-200">
          <div
            className="h-full rounded-full bg-warm-800 transition-all"
            style={{ width: `${Math.min(100, (matches.length / 200) * 100)}%` }}
          />
        </div>
      </div>

      {/* 배틀 카드 */}
      <div className="grid grid-cols-[1fr_32px_1fr] gap-2 items-stretch">
        <MatchCard
          song={matchup.left}
          rating={matchup.leftRating.rating}
          onSelect={() => submitMatch(1)}
        />

        {/* 중간 VS */}
        <div className="flex flex-col items-center justify-center gap-1.5">
          <span className="text-xs font-medium text-warm-300">VS</span>
          <span className="rounded-full border border-warm-200 px-1.5 py-0.5 text-[9px] text-warm-300">
            Δ{Math.round(matchup.gap)}
          </span>
          {mode === 'binary' && (
            <button
              type="button"
              onClick={() => submitMatch(0.5)}
              className="rounded-full border border-warm-200 px-1.5 py-1 text-[8px] text-warm-300 hover:text-warm-500"
            >
              무승부
            </button>
          )}
        </div>

        <MatchCard
          song={matchup.right}
          rating={matchup.rightRating.rating}
          onSelect={() => submitMatch(0)}
        />
      </div>

      {/* 재생 상태 / 에러 */}
      {user?.isPremium && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warm-100 bg-warm-50 px-3 py-2">
          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${ready ? 'bg-brand-500' : 'bg-warm-300'}`} />
          <span className="text-[10px] text-warm-400">
            {playerError
              ? playerError
              : ready
                ? `Web Player 연결됨 · 전곡 재생 가능${playing ? ' · 재생 중' : ''}`
                : 'Web Player 연결 중…'}
          </span>
          {playerError && (playerError.includes('재생 권한') || playerError.includes('재로그인')) ? (
            <button
              type="button"
              onClick={() => {
                void signInWithSpotify();
              }}
              className="rounded-full border border-warm-200 px-2.5 py-1 text-[10px] font-medium text-warm-600 hover:border-warm-300 hover:text-warm-800"
            >
              Spotify 다시 로그인
            </button>
          ) : null}
        </div>
      )}

      {/* 척도 버튼 */}
      {mode === 'scale' ? (
        <div className="grid grid-cols-5 gap-1.5">
          {SCALE_STEPS.map((step) => (
            <button
              key={step.label}
              type="button"
              onClick={() => submitMatch(step.score)}
              className={`rounded-xl border py-2.5 text-center text-[11px] font-medium transition active:scale-95 ${
                step.neutral
                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                  : 'border-warm-200 text-warm-700 hover:bg-warm-50'
              }`}
            >
              {step.label}
              <span className="mt-0.5 block text-[9px] font-normal text-warm-400">S={step.score}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => submitMatch(1)}
            className="rounded-xl border border-warm-200 py-3 text-xs font-medium text-warm-800 transition hover:bg-warm-50 active:scale-95"
          >
            A가 더 좋아요
            <span className="mt-0.5 block text-[9px] font-normal text-warm-400">S=1.0</span>
          </button>
          <button
            type="button"
            onClick={() => submitMatch(0)}
            className="rounded-xl border border-warm-200 py-3 text-xs font-medium text-warm-800 transition hover:bg-warm-50 active:scale-95"
          >
            B가 더 좋아요
            <span className="mt-0.5 block text-[9px] font-normal text-warm-400">S=0.0</span>
          </button>
        </div>
      )}

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-1.5 border-t border-warm-200 pt-3">
        {[
          { label: '총 비교', val: matches.length },
          { label: 'Δ Elo', val: Math.round(matchup.gap) },
          { label: 'Top-K', val: topK },
          { label: '분류 곡', val: songs.filter((s) => s.tier !== undefined).length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-warm-100 px-2 py-1.5">
            <p className="text-[9px] text-warm-400">{stat.label}</p>
            <p className="text-sm font-medium text-warm-700">{stat.val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
