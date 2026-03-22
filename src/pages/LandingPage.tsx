import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserPlaylists, importPlaylistTracks } from "../lib/spotify";
import { signInWithSpotify } from "../lib/supabase";
import { useAppStore, type ActiveSource } from "../store/appStore";

function getSourceSongCount(
  sourceId: string | undefined,
  songs: Array<{ playlistId: string }>,
) {
  if (!sourceId) return 0;
  return songs.filter((song) => song.playlistId === sourceId).length;
}

function estimateSession(count: number): string {
  if (count <= 50) return "약 30분 미만";
  if (count <= 150) return "약 1~2 세션";
  if (count <= 400) return "약 2~3 세션";
  return "약 3~4 세션";
}

export function LandingPage() {
  const navigate = useNavigate();
  const {
    auth,
    user,
    playlists,
    setPlaylists,
    selectPlaylist,
    selectedPlaylistId,
    importSongs,
    setActiveSource,
    activeSource,
    songs,
    matches,
  } = useAppStore();

  const [loginError, setLoginError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    selectedPlaylistId,
  );

  // 플레이리스트 불러오기
  useEffect(() => {
    if (!user || playlists.length > 0) return;
    let cancelled = false;
    setLoading(true);
    getUserPlaylists(auth?.accessToken)
      .then((list) => {
        if (!cancelled) setPlaylists(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, auth?.accessToken, playlists.length, setPlaylists]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedId);
  const hasResume = Boolean(
    activeSource && songs.length > 0 && matches.length > 0,
  );
  const activeSourceSongCount = getSourceSongCount(activeSource?.id, songs);
  const classifiedSongCount = activeSource
    ? songs.filter(
        (song) =>
          song.playlistId === activeSource.id && song.tier !== undefined,
      ).length
    : 0;
  const selectedPlaylistSongCount = selectedPlaylist
    ? getSourceSongCount(selectedPlaylist.id, songs)
    : 0;
  const selectedPlaylistAppTrackCount =
    selectedPlaylist && activeSource?.id === selectedPlaylist.id
      ? activeSource.trackCount || selectedPlaylistSongCount
      : selectedPlaylistSongCount;
  const selectedPlaylistDisplayCount =
    selectedPlaylistAppTrackCount || selectedPlaylist?.trackCount || 0;

  async function handleStart() {
    if (!selectedId || !selectedPlaylist) return;
    setStarting(true);
    try {
      const imported = await importPlaylistTracks(
        selectedId,
        auth?.accessToken,
      );
      if (imported.length > 0) importSongs(imported);
      const src: ActiveSource = {
        id: selectedId,
        name: selectedPlaylist.name,
        trackCount: imported.length,
        imageUrl: selectedPlaylist.imageUrl,
        isLikedSongs: selectedPlaylist.isLikedSongs,
      };
      setActiveSource(src);
      selectPlaylist(selectedId);
      navigate("/bucket");
    } catch (e) {
      console.error(e);
    } finally {
      setStarting(false);
    }
  }

  function handleResume() {
    navigate("/bucket");
  }

  function handleNewSession() {
    useAppStore.getState().resetFlow();
    setSelectedId(undefined);
  }

  // ── 미로그인 랜딩 ──
  if (!user) {
    return (
      <div className="space-y-8 pt-4">
        <div className="text-center">
          <p className="mb-3 text-xs uppercase tracking-widest text-warm-400">
            Elo Rating · Top-K Matching
          </p>
          <h1 className="font-display text-4xl leading-tight tracking-tight text-warm-800">
            내 음악 취향을
            <br />
            <em className="not-italic text-brand-500">정확하게</em> 정렬해요
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-warm-500">
            좋아하는 곡 수백 개를 직접 비교해서 순위를 매기는 건 불가능에
            가깝습니다. Elo와 Top-K 샘플링으로 가능하게 만들었어요.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                setLoginError(undefined);
                void signInWithSpotify().catch((e: unknown) => {
                  setLoginError(
                    e instanceof Error
                      ? e.message
                      : "로그인 중 오류가 발생했어요",
                  );
                });
              }}
              className="inline-flex items-center gap-2.5 rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115.294.181.387.564.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.78.78 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 9.215 9.375 9.032 6.297 9.99a.937.937 0 11-.543-1.794c3.532-1.073 9.404-.866 13.115 1.337a.937.937 0 01-.955 1.334z" />
              </svg>
              Spotify로 시작하기
            </button>
          </div>
          {loginError && (
            <p className="mt-3 text-xs text-red-500">{loginError}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: "🗂️",
              title: "3단계 분류",
              desc: "선호·보통·기타로 사전 분류해 수렴 속도 향상",
            },
            {
              icon: "⚡",
              title: "Top-K 매칭",
              desc: "가중 샘플링으로 반복 없는 최적 비교 쌍 선택",
            },
            {
              icon: "🏆",
              title: "Elo 랭킹",
              desc: "비교 결과가 실시간으로 순위에 반영됩니다",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-warm-200 bg-white p-3.5"
            >
              <div className="mb-1.5 text-base">{f.icon}</div>
              <div className="text-xs font-medium text-warm-800">{f.title}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-warm-400">
                {f.desc}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-warm-400">
          Premium: 전곡 재생 · Free: 30초 미리듣기
          <br />
          로그인 없이는 서비스를 이용할 수 없어요
        </p>
      </div>
    );
  }

  // ── 로그인 후 홈 ──
  return (
    <div className="space-y-5">
      {/* 유저 배지 */}
      <div className="flex items-center gap-3 rounded-xl border border-warm-200 bg-white px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-medium text-white">
          {(user.email?.[0] ?? "U").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warm-800 truncate">
            {user.email}
          </p>
          <p className="text-xs text-warm-400">
            Spotify {user.isPremium ? "Premium" : "Free"} 연결됨
          </p>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${user.isPremium ? "border-amber-300 bg-amber-50 text-amber-700" : "border-warm-200 bg-warm-100 text-warm-400"}`}
        >
          {user.isPremium ? "Premium" : "Free"}
        </span>
      </div>

      {/* 이전 세션 이어하기 */}
      {hasResume && activeSource && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-base">
              {activeSource.isLikedSongs ? "💚" : "🎵"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warm-800 truncate">
                {activeSource.name}
              </p>
              <p className="text-xs text-warm-500">
                {matches.length}회 비교 완료 · {classifiedSongCount}/
                {activeSourceSongCount || activeSource.trackCount}곡 분류
              </p>
            </div>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{
                width: `${Math.min(100, Math.round((classifiedSongCount / Math.max(activeSourceSongCount || activeSource.trackCount, 1)) * 100))}%`,
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleResume}
              className="rounded-lg bg-warm-800 py-2.5 text-xs font-medium text-white transition hover:bg-warm-700"
            >
              이어하기 →
            </button>
            <button
              type="button"
              onClick={handleNewSession}
              className="rounded-lg border border-warm-200 py-2.5 text-xs font-medium text-warm-500 transition hover:bg-white"
            >
              새로 시작
            </button>
          </div>
        </div>
      )}

      {/* 소스 선택 */}
      <div>
        <p className="mb-3 text-sm font-medium text-warm-700">
          {hasResume ? "다른 소스 선택" : "소팅할 플레이리스트 선택"}
        </p>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-warm-100"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => setSelectedId(playlist.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  selectedId === playlist.id
                    ? "border-warm-800 bg-warm-50 ring-1 ring-warm-800"
                    : "border-warm-200 bg-white hover:border-warm-300 hover:bg-warm-50"
                }`}
              >
                {playlist.imageUrl ? (
                  <img
                    src={playlist.imageUrl}
                    alt={playlist.name}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warm-100 text-lg">
                    {playlist.isLikedSongs ? "💚" : "🎵"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-warm-800">
                    {playlist.name}
                  </p>
                  <p className="text-xs text-warm-400">
                    {playlist.trackCount.toLocaleString()}곡
                  </p>
                </div>
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition ${
                    selectedId === playlist.id
                      ? "border-warm-800 bg-warm-800 text-white"
                      : "border-warm-300 text-transparent"
                  }`}
                >
                  ✓
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 시작 버튼 */}
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={!selectedPlaylist || starting}
          className="mt-4 flex w-full items-center justify-between rounded-xl bg-warm-800 px-5 py-3.5 text-left transition hover:bg-warm-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <div>
            <p className="text-sm font-medium text-white">
              {selectedPlaylist
                ? `${selectedPlaylist.name}으로 소팅 시작`
                : "소스를 선택해주세요"}
            </p>
            {selectedPlaylist && (
              <p className="text-xs text-white/60">
                {selectedPlaylistDisplayCount.toLocaleString()}곡 ·{" "}
                {estimateSession(selectedPlaylistDisplayCount)}
              </p>
            )}
          </div>
          <span className="text-white/70 text-lg">
            {starting ? "···" : "→"}
          </span>
        </button>
      </div>
    </div>
  );
}
