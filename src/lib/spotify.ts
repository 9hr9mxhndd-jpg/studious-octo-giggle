import { demoPlaylists, demoSongs } from './sampleData';
import { buildSongId } from './songIdentity';
import { persistSpotifyToken, supabase } from './supabase';
import type { PlaylistSummary, Song, SpotifyProduct } from '../types';

const API_ROOT = 'https://api.spotify.com/v1';
const FALLBACK_PLAYLIST_IMAGE = 'https://picsum.photos/seed/playlist/300/300';
const FALLBACK_TRACK_IMAGE = 'https://picsum.photos/seed/track/300/300';

// ── 캐시: sessionStorage 기반 (새로고침 후에도 탭 세션 내 유지) ──
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const inFlightRequests = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const { data, expires } = JSON.parse(raw) as { data: T; expires: number };
    if (Date.now() > expires) { sessionStorage.removeItem(key); return undefined; }
    return data;
  } catch { return undefined; }
}

function setCache<T>(key: string, data: T, ttlMs = CACHE_TTL_MS) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expires: Date.now() + ttlMs }));
  } catch {}
}

interface SpotifyImage { url?: string | null }
interface SpotifyArtist { name?: string | null }
interface SpotifyTrack {
  id?: string | null;
  type?: string | null;
  name?: string | null;
  preview_url?: string | null;
  duration_ms?: number | null;
  album?: { name?: string | null; images?: SpotifyImage[] | null } | null;
  artists?: SpotifyArtist[] | null;
}
interface SpotifyPagingResponse<T> {
  items?: T[];
  next?: string | null;
  total?: number | null;
}
interface SpotifyPlaylistItem {
  id?: string;
  name?: string;
  description?: string | null;
  images?: SpotifyImage[] | null;
  items?: { total?: number | null } | null;
  tracks?: { total?: number | null } | null;
}
interface SpotifyProfile {
  id?: string;
  country?: string | null;
  product?: SpotifyProduct;
}

async function spotifyFetch<T>(path: string, accessToken: string, _isRetry = false): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!res.ok) {
    if (res.status === 401 && !_isRetry) {
      if (supabase) {
        const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
        const newToken = data.session?.provider_token;
        if (newToken && newToken !== accessToken) {
          const userId = data.session?.user?.id;
          if (userId) {
            void persistSpotifyToken(userId, newToken).catch(() => {});
          }
          return spotifyFetch<T>(path, newToken, true);
        }
      }
    }

    const retryAfter = res.headers.get('Retry-After');
    const msg =
      res.status === 401 ? 'Spotify 세션이 만료됐어요. 다시 로그인해주세요.' :
      res.status === 403 ? 'Spotify 접근이 거부됐어요. 스코프 설정을 확인해주세요.' :
      res.status === 429 ? `Spotify rate limit 도달${retryAfter ? ` (${retryAfter}초 후 재시도)` : ''}.` :
      `Spotify 요청 실패 (${res.status})`;
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

function buildSpotifyUrl(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(path.startsWith('http') ? path : `${API_ROOT}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

// ── 전체 페이지 자동 수집 ──

function dedupeRequest<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const next = loader().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, next);
  return next;
}

function isBadRequestError(error: unknown) {
  return error instanceof Error && error.message.includes('(400)');
}

async function fetchAllPages<T>(
  firstUrl: string,
  accessToken: string,
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = firstUrl;

  while (url) {
    const page: SpotifyPagingResponse<T> = await spotifyFetch<SpotifyPagingResponse<T>>(url, accessToken);
    results.push(...(page.items ?? []));
    url = page.next ?? null;
  }

  return results;
}

async function getSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const cacheKey = `spotify-profile:${accessToken.slice(-16)}`;
  const cached = getCached<SpotifyProfile>(cacheKey);
  if (cached) return cached;

  return dedupeRequest(cacheKey, async () => {
    const profile = await spotifyFetch<SpotifyProfile>('/me', accessToken);
    setCache(cacheKey, profile);
    return profile;
  });
}

function normalizeTrack(track: SpotifyTrack, playlistId: string, _index: number): Song | undefined {
  if (track.type && track.type !== 'track') return undefined;
  if (!track.id || !track.name) return undefined;
  return {
    id: buildSongId(playlistId, track.id),
    spotifyTrackId: track.id,
    playlistId,
    title: track.name,
    artist: (track.artists ?? []).map((a) => a.name).filter((n): n is string => Boolean(n)).join(', ') || 'Unknown artist',
    album: track.album?.name ?? 'Unknown album',
    imageUrl: track.album?.images?.[0]?.url || FALLBACK_TRACK_IMAGE,
    previewUrl: track.preview_url ?? undefined,
    durationMs: track.duration_ms ?? 0,
    uncertain: false,
  };
}

export async function getSpotifyProduct(accessToken?: string): Promise<SpotifyProduct> {
  if (!accessToken) return 'unknown';
  try {
    const me = await getSpotifyProfile(accessToken);
    return me.product ?? 'unknown';
  } catch { return 'unknown'; }
}

// ── 플레이리스트 목록: Spotify 문서 기준으로 `items.total`을 우선 사용하고,
//    구버전 응답 호환을 위해 `tracks.total`도 함께 폴백합니다. ──
export async function getUserPlaylists(
  accessToken?: string,
  options?: { forceRefresh?: boolean },
): Promise<PlaylistSummary[]> {
  if (!accessToken) return demoPlaylists;

  const cacheKey = `playlists:${accessToken.slice(-16)}`;
  const cached = options?.forceRefresh ? undefined : getCached<PlaylistSummary[]>(cacheKey);
  if (cached) return cached;

  return dedupeRequest(cacheKey, async () => {
    // 좋아요 곡 수 (한 번만)
    let likedCount = 0;
    try {
      const liked = await spotifyFetch<{ total?: number }>(buildSpotifyUrl('/me/tracks', { limit: 1 }), accessToken);
      likedCount = liked.total ?? 0;
    } catch {}

    const playlistListUrl = buildSpotifyUrl('/me/playlists', {
      limit: 50,
      fields: 'items(id,name,description,images(url),items(total),tracks(total)),next',
    });

    let rawPlaylists: SpotifyPlaylistItem[];
    try {
      rawPlaylists = await fetchAllPages<SpotifyPlaylistItem>(playlistListUrl, accessToken);
    } catch (error) {
      // fields 최적화가 특정 계정/응답 형태에서 400을 내면 기본 응답으로 즉시 폴백합니다.
      if (!isBadRequestError(error)) throw error;
      rawPlaylists = await fetchAllPages<SpotifyPlaylistItem>(
        buildSpotifyUrl('/me/playlists', { limit: 50 }),
        accessToken,
      );
    }

    const playlists: PlaylistSummary[] = [
      // 좋아요 곡을 맨 앞에 고정
      {
        id: 'liked',
        name: '좋아요 표시한 노래',
        description: '내가 좋아요를 누른 모든 곡',
        imageUrl: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
        trackCount: likedCount,
        isLikedSongs: true,
      },
      ...rawPlaylists
        .filter((p): p is SpotifyPlaylistItem & { id: string; name: string } => Boolean(p?.id && p.name))
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description?.trim() || '',
          imageUrl: p.images?.[0]?.url || FALLBACK_PLAYLIST_IMAGE,
          trackCount: p.items?.total ?? p.tracks?.total ?? 0,
        })),
    ];

    setCache(cacheKey, playlists);
    return playlists;
  });
}

// ── 트랙 임포트: 좋아요 곡과 일반 플레이리스트 분기 + 전 페이지 수집 ──
export async function importPlaylistTracks(playlistId: string, accessToken?: string): Promise<Song[]> {
  if (!accessToken) {
    return demoSongs.filter((s) => s.playlistId === playlistId || playlistId.startsWith('demo-'));
  }

  const cacheKey = `tracks:${playlistId}:${accessToken.slice(-16)}`;
  const cached = getCached<Song[]>(cacheKey);
  if (cached) return cached;

  return dedupeRequest(cacheKey, async () => {
    const profile = await getSpotifyProfile(accessToken).catch(() => undefined);
    // Saved Tracks / Playlist Items 문서는 ISO 시장 코드 사용을 전제로 하므로
    // 프로필 국가를 못 받았을 때는 market 파라미터 자체를 생략합니다.
    const market = profile?.country ?? undefined;

    const fetchTrackPages = async (urlWithMarket: string, urlWithoutMarket: string) => {
      try {
        return await fetchAllPages<{ track?: SpotifyTrack | null }>(urlWithMarket, accessToken);
      } catch (error) {
        if (!market || !isBadRequestError(error)) throw error;
        return fetchAllPages<{ track?: SpotifyTrack | null }>(urlWithoutMarket, accessToken);
      }
    };

    let songs: Song[];

    if (playlistId === 'liked') {
      const items = await fetchTrackPages(
        buildSpotifyUrl('/me/tracks', { limit: 50, market }),
        buildSpotifyUrl('/me/tracks', { limit: 50 }),
      );
      songs = items
        .map((item, i) => item.track ? normalizeTrack(item.track, 'liked', i) : undefined)
        .filter((s): s is Song => Boolean(s));
    } else {
      const items = await fetchTrackPages(
        buildSpotifyUrl(`/playlists/${playlistId}/tracks`, {
          limit: 50,
          market,
          additional_types: 'track',
        }),
        buildSpotifyUrl(`/playlists/${playlistId}/tracks`, {
          limit: 50,
          additional_types: 'track',
        }),
      );
      songs = items
        .map((item, i) => item.track ? normalizeTrack(item.track, playlistId, i) : undefined)
        .filter((s): s is Song => Boolean(s));
    }

    setCache(cacheKey, songs, 10 * 60 * 1000);
    return songs;
  });
}
