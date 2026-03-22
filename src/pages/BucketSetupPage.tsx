import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import type { Tier } from '../types';

export function BucketSetupPage() {
  const navigate = useNavigate();
  const songs = useAppStore((s) => s.songs);
  const assignTier = useAppStore((s) => s.assignTier);
  const user = useAppStore((s) => s.user);
  const [history, setHistory] = useState<Array<{ id: string; prevTier?: Tier; prevUncertain: boolean }>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // 프리미엄 전용 Web Playback SDK
  const { ready, playing: sdkPlaying, currentTrackId, error: playerError, togglePlay } = useSpotifyPlayer();

  const unassigned = songs.filter((s) => s.tier === undefined);
  const current = unassigned[0];
  const classified = songs.length - unassigned.length;
  const total = songs.length;

  const c1 = songs.filter((s) => s.tier === 1).length;
  const c2 = songs.filter((s) => s.tier === 2).length;
  const c3 = songs.filter((s) => s.tier === 3).length;
  const pct = (n: number) => (classified > 0 ? Math.round((n / classified) * 100) : 0);

  function handlePlay() {
    if (!current) return;

    if (user?.isPremium) {
      // 프리미엄: Web Playback SDK로 전곡 재생
      void togglePlay(current.spotifyTrackId);
      return;
    }

    // Free: previewUrl 미리듣기
    if (!current.previewUrl) return;
    if (previewPlaying) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPreviewPlaying(false);
    } else {
      const audio = new Audio(current.previewUrl);
      audio.play().catch(() => {});
      audio.onended = () => setPreviewPlaying(false);
      audioRef.current = audio;
      setPreviewPlaying(true);
    }
  }

  function handleTierAssign(tier: Tier) {
    if (!current) return;
    // 티어 이동 시 재생 중이던 곡 정지
    audioRef.current?.pause();
    audioRef.current = null;
    setPreviewPlaying(false);
    setHistory((h) => [...h, { id: current.id, prevTier: current.tier, prevUncertain: current.uncertain }]);
    assignTier(current.id, tier, current.uncertain);
  }

  function tierUndo() {
    const last = history[history.length - 1];
    if (!last) return;
    if (last.prevTier !== undefined) {
      assignTier(last.id, last.prevTier, last.prevUncertain);
    } else {
      useAppStore.setState((state) => ({
        songs: state.songs.map((s) =>
          s.id === last.id ? { ...s, tier: undefined, uncertain: last.prevUncertain } : s
        ),
      }));
    }
    setHistory((h) => h.slice(0, -1));
  }

  function toggleUnsure() {
    if (!current) return;
    assignTier(current.id, current.tier ?? 2, !current.uncertain);
  }

  // 현재 곡이 SDK로 재생 중인지 확인
  const isCurrentPlaying = user?.isPremium
    ? sdkPlaying && currentTrackId === current?.spotifyTrackId
    : previewPlaying;

  // 재생 버튼 표시 조건
  const canPlay = user?.isPremium
    ? ready           // 프리미엄: SDK 준비되면 항상 가능
    : Boolean(current?.previewUrl); // Free: previewUrl 있을 때만

  const sessSize = 50;
  const sessProgress = ((classified % sessSize) / sessSize) * 100;
  const totalProgress = (classified / Math.max(total, 1)) * 100;
  const sessLeft = sessSize - (classified % sessSize);

  const ruleHints: string[] = [];
  if (classified > 10) {
    if (pct(c1) > 15) ruleHints.push('T1 목표(10%) 초과');
    else if (pct(c1) < 6) ruleHints.push('T1 목표(10%) 미달');
    if (pct(c2) > 55) ruleHints.push('T2 목표(40%) 초과');
    else if (pct(c2) < 25) ruleHints.push('T2 목표(40%) 미달');
  }

  return (
    <div className="space-y-4">
      {/* 진행률 */}
      <div>
        <div className="mb-1.5 flex justify-between text-xs text-warm-400">
          <span>세션 <b className="text-warm-700">{classified % sessSize}</b> / 50</span>
          <span>약 {Math.ceil(sessLeft * 0.5)}분 남음</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-warm-200">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${sessProgress}%` }} />
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-warm-200">
          <div className="h-full rounded-full bg-blue-300 transition-all" style={{ width: `${totalProgress}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-warm-400">전체 {classified} / {total}곡</p>
      </div>

      {/* 현재 곡 카드 */}
      {current ? (
        <div className="rounded-2xl border border-warm-200 bg-white p-4">
          <div className="flex gap-3">
            {current.imageUrl ? (
              <img src={current.imageUrl} alt={current.title} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-2xl">🎵</div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-warm-800">{current.title}</p>
              <p className="truncate text-xs text-warm-400">{current.artist}</p>
              <div className="mt-2 flex items-center gap-2">
                {/* 재생 버튼 */}
                <button
                  type="button"
                  onClick={handlePlay}
                  disabled={!canPlay}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition
                    ${canPlay
                      ? isCurrentPlaying
                        ? 'border-brand-400 bg-brand-50 text-brand-600'
                        : 'border-warm-200 text-warm-500 hover:text-warm-700'
                      : 'border-warm-200 text-warm-300 cursor-not-allowed'
                    }`}
                >
                  {isCurrentPlaying ? (
                    <>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                        <rect x="0" y="0" width="3" height="8" /><rect x="5" y="0" width="3" height="8" />
                      </svg>
                      정지
                    </>
                  ) : (
                    <>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                        <polygon points="1,0 9,5 1,10" />
                      </svg>
                      {user?.isPremium
                        ? (ready ? '전곡 재생' : '연결 중…')
                        : (canPlay ? '미리듣기' : '미리듣기 없음')}
                    </>
                  )}
                </button>

                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-warm-400">
                  <input
                    type="checkbox"
                    id="t-unsure"
                    checked={current.uncertain}
                    onChange={toggleUnsure}
                    className="h-3 w-3 rounded"
                  />
                  확실하지 않음
                </label>
              </div>
              {current.uncertain && (
                <p className="mt-1.5 rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">
                  K=60 경계 곡으로 처리됩니다
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-sm font-medium text-warm-800">모든 곡 분류 완료!</p>
          <p className="mt-1 text-xs text-warm-500">소팅 탭으로 이동하세요</p>
        </div>
      )}

      {user?.isPremium && playerError ? (
        <div className="flex items-center gap-2 rounded-xl border border-warm-100 bg-warm-50 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <span className="text-[10px] text-warm-500">{playerError}</span>
        </div>
      ) : null}

      {/* 티어 버튼 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { tier: 1 as Tier, label: 'T1 최애', sub: '이 곡 사랑해', cls: 'border-green-300 hover:bg-green-50 hover:border-green-500' },
          { tier: 2 as Tier, label: 'T2 선호', sub: '이 곡 좋아', cls: 'border-blue-300 hover:bg-blue-50 hover:border-blue-500' },
          { tier: 3 as Tier, label: 'T3 보통', sub: '나쁘진 않아', cls: 'border-warm-200 hover:bg-warm-50' },
        ].map((btn) => (
          <button
            key={btn.tier}
            type="button"
            onClick={() => handleTierAssign(btn.tier)}
            disabled={!current}
            className={`rounded-xl border py-3 text-center text-xs font-medium text-warm-800 transition active:scale-95 disabled:opacity-40 ${btn.cls}`}
          >
            {btn.label}
            <span className="mt-0.5 block text-[9px] font-normal text-warm-400">{btn.sub}</span>
          </button>
        ))}
      </div>

      {/* 액션 로우 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={tierUndo}
          disabled={history.length === 0}
          className="text-xs text-warm-400 disabled:opacity-30 hover:text-warm-600"
        >
          ← 되돌리기
        </button>
        <button
          type="button"
          onClick={() => navigate('/ranking')}
          className="text-xs text-warm-400 underline decoration-dotted underline-offset-2 hover:text-warm-700"
        >
          랭킹 보기
        </button>
      </div>

      {/* 퍼센트 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'T1 최애', val: pct(c1), cnt: c1, color: 'text-green-700' },
          { label: 'T2 선호', val: pct(c2), cnt: c2, color: 'text-blue-700' },
          { label: 'T3 보통', val: pct(c3), cnt: c3, color: 'text-warm-600' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-warm-100 px-3 py-2">
            <p className="text-[10px] text-warm-400">{item.label}</p>
            <p className={`text-base font-medium ${item.color}`}>{item.val}%</p>
            <p className="text-[10px] text-warm-400">{item.cnt}곡</p>
          </div>
        ))}
      </div>

      {/* 분포 바 */}
      <div className="flex h-1.5 overflow-hidden rounded-full bg-warm-200">
        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct(c1)}%` }} />
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct(c2)}%` }} />
        <div className="h-full bg-warm-300 transition-all" style={{ width: `${pct(c3)}%` }} />
      </div>
      {ruleHints.length > 0 ? (
        <p className="text-[10px] text-amber-600">{ruleHints.join(' · ')}</p>
      ) : classified > 10 ? (
        <p className="text-[10px] text-green-600">10/40/50 분포 양호</p>
      ) : null}

      {/* 소팅 시작 버튼 */}
      {unassigned.length === 0 && songs.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/match')}
          className="w-full rounded-xl bg-warm-800 py-3 text-sm font-medium text-white transition hover:bg-warm-700"
        >
          소팅 시작 →
        </button>
      )}
    </div>
  );
}
