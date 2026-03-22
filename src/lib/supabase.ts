import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSnapshot, UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SPOTIFY_OAUTH_ATTEMPT_STORAGE_KEY = 'spotify-supabase-oauth-attempt';
const SPOTIFY_OAUTH_RETRY_WINDOW_MS = 5 * 60 * 1000;
const SPOTIFY_BASE_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ');
const SPOTIFY_PLAYBACK_SCOPES = [
  'user-read-playback-state',
  'streaming',
  'user-modify-playback-state',
].join(' ');

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : undefined;

let spotifyProviderToken: string | undefined;

interface PendingSpotifyOAuthAttempt {
  startedAt: number;
  retryCount: number;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function readPendingSpotifyOAuthAttempt() {
  if (!isBrowser()) return undefined;

  try {
    const raw = window.sessionStorage.getItem(SPOTIFY_OAUTH_ATTEMPT_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PendingSpotifyOAuthAttempt;
  } catch {
    return undefined;
  }
}

function writePendingSpotifyOAuthAttempt(attempt: PendingSpotifyOAuthAttempt) {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(SPOTIFY_OAUTH_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
}

function markPendingSpotifyOAuthAttempt(retryCount = 0) {
  writePendingSpotifyOAuthAttempt({
    startedAt: Date.now(),
    retryCount,
  });
}

export function clearPendingSpotifyOAuthAttempt() {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(SPOTIFY_OAUTH_ATTEMPT_STORAGE_KEY);
}

export function shouldRetrySpotifyOAuth(
  errorMessage?: string,
  errorCode?: string,
) {
  if (!errorMessage) return false;

  const normalizedMessage = errorMessage.toLowerCase();
  const normalizedCode = errorCode?.toLowerCase();
  const isProviderProfileFailure =
    normalizedMessage.includes('external provider') || normalizedCode === 'unexpected_failure';

  if (!isProviderProfileFailure) return false;

  const pendingAttempt = readPendingSpotifyOAuthAttempt();
  if (!pendingAttempt) return false;

  const isFreshAttempt = Date.now() - pendingAttempt.startedAt <= SPOTIFY_OAUTH_RETRY_WINDOW_MS;
  return isFreshAttempt && pendingAttempt.retryCount < 1;
}

export function markSpotifyOAuthRetry() {
  const pendingAttempt = readPendingSpotifyOAuthAttempt();
  if (!pendingAttempt) {
    markPendingSpotifyOAuthAttempt(1);
    return;
  }

  writePendingSpotifyOAuthAttempt({
    ...pendingAttempt,
    retryCount: pendingAttempt.retryCount + 1,
  });
}

export function saveSpotifyToken(token: string) {
  spotifyProviderToken = token;
}

export function loadSpotifyToken(): string | undefined {
  return spotifyProviderToken;
}

export function clearSpotifyToken() {
  spotifyProviderToken = undefined;
}

export async function persistSpotifyToken(userId: string, token?: string) {
  if (token) {
    saveSpotifyToken(token);
  } else {
    clearSpotifyToken();
  }
  if (!supabase) return;
  const { error } = await supabase.from('sorter_state').upsert({
    user_id: userId,
    spotify_provider_token: token ?? null,
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

function getBaseRedirectUrl() {
  if (import.meta.env.VITE_SUPABASE_REDIRECT_TO) {
    return import.meta.env.VITE_SUPABASE_REDIRECT_TO;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:5173';
}

export function getSpotifyRedirectUrl() {
  const url = new URL(getBaseRedirectUrl());
  url.pathname = '/auth/callback';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function getAuthCallbackErrorMessage(location: Location = window.location) {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const rawError =
    searchParams.get('error_description') ??
    searchParams.get('error') ??
    hashParams.get('error_description') ??
    hashParams.get('error');

  return rawError ? decodeURIComponent(rawError.replace(/\+/g, ' ')) : undefined;
}

export function getAuthCallbackErrorCode(location: Location = window.location) {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  return searchParams.get('error_code') ?? hashParams.get('error_code') ?? undefined;
}

export async function exchangeCodeForSessionIfPresent(location: Location = window.location) {
  if (!supabase) {
    return { errorMessage: 'Supabase 환경변수가 설정되지 않았어요.' };
  }

  const errorMessage = getAuthCallbackErrorMessage(location);
  if (errorMessage) {
    return { errorMessage };
  }

  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) {
    return { errorMessage: undefined };
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error && data.session) {
    clearPendingSpotifyOAuthAttempt();
    const providerToken = data.session.provider_token ?? undefined;
    const userId = data.session.user?.id;
    if (userId && providerToken) {
      await persistSpotifyToken(userId, providerToken).catch(() => {});
    }
  }

  return {
    errorMessage: error ? error.message : undefined,
  };
}

export function getSpotifyLoginTroubleshooting(
  errorMessage?: string,
  errorCode?: string,
) {
  if (!errorMessage) return undefined;

  const normalizedMessage = errorMessage.toLowerCase();
  const normalizedCode = errorCode?.toLowerCase();
  const isProviderProfileFailure =
    normalizedMessage.includes('external provider') || normalizedCode === 'unexpected_failure';

  if (!isProviderProfileFailure) {
    return undefined;
  }

  return {
    title: 'Supabase를 거치는 Spotify 소셜 로그인 단계에서 실패했어요.',
    items: [
      '가장 흔한 원인은 Redirect URI 위치가 뒤바뀐 경우예요. 기본 로그인 흐름에서는 Spotify Redirect URI를 앱의 /auth/callback 이 아니라 Supabase callback URL(https://<project-ref>.supabase.co/auth/v1/callback)로 유지해야 합니다.',
      '동시에 Supabase Auth Redirect URLs에는 현재 배포 origin의 정확한 /auth/callback URL이 등록되어 있어야 해요. 프로덕션, 프리뷰, 커스텀 도메인을 모두 쓰면 각각을 전부 추가해야 합니다.',
      'Supabase Authentication > Providers > Spotify 에 저장된 Client ID / Client Secret 이 오래됐거나 잘못 붙여넣어졌다면 동일한 오류가 납니다. Spotify Developer Dashboard 값으로 다시 복사해 저장해 보세요.',
      'Spotify 앱이 Development Mode 라면 Spotify Developer Dashboard > User Management 에 현재 로그인하는 Spotify 계정 이메일이 반드시 등록되어 있어야 합니다.',
      'Spotify의 2026-03-09 정책 이후에는 기존 Development Mode 앱에서 앱 소유자 Premium 상태가 끊기면 외부 provider 프로필 조회가 실패할 수 있습니다. 앱 소유자 계정 플랜도 확인하세요.',
      '브라우저에서 예전 /auth/callback 탭을 다시 열거나 이미 사용된 code 를 재사용하면 같은 에러 화면이 반복될 수 있어요. 현재 콜백 탭을 닫고 홈에서 로그인 버튼을 다시 눌러 새 흐름으로 시작해 보세요.',
      '이 앱은 현재 Supabase Spotify Social Login 한 경로만 사용합니다. Spotify Redirect URI는 계속 Supabase callback URL을 가리켜야 합니다.',
      '프리뷰 배포에서만 실패한다면 VITE_SUPABASE_REDIRECT_TO 가 현재 배포 origin 과 정확히 일치하는지, 그리고 그 URL 이 Supabase 허용 리디렉션 목록에 있는지도 확인하세요.',
    ],
  };
}

async function signInWithSupabaseSpotify(
  preserveRetryCount = false,
  scopes = SPOTIFY_BASE_SCOPES,
) {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았어요.');
  }

  const retryCount = preserveRetryCount ? readPendingSpotifyOAuthAttempt()?.retryCount ?? 0 : 0;
  markPendingSpotifyOAuthAttempt(retryCount);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      scopes,
      redirectTo: getSpotifyRedirectUrl(),
    },
  });

  if (error) {
    clearPendingSpotifyOAuthAttempt();
    throw error;
  }
}

export async function signInWithSpotify(options?: { preserveRetryCount?: boolean }) {
  await signInWithSupabaseSpotify(options?.preserveRetryCount);
}

export async function signInWithSpotifyPlaybackPermissions() {
  await signInWithSupabaseSpotify(
    false,
    [SPOTIFY_BASE_SCOPES, SPOTIFY_PLAYBACK_SCOPES].join(' '),
  );
}

export async function signOut() {
  clearPendingSpotifyOAuthAttempt();
  clearSpotifyToken();
  if (!supabase) return;

  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sessionToAuthSnapshot(session: Session | null): Promise<AuthSnapshot | undefined> {
  if (!session) return undefined;

  const providerToken = session.provider_token ?? loadSpotifyToken();
  if (session.user.id && providerToken) {
    await persistSpotifyToken(session.user.id, providerToken);
  }

  return {
    provider: 'supabase',
    accessToken: providerToken,
    refreshToken: session.provider_refresh_token ?? undefined,
  };
}

export function profileFromSession(
  session: Session | null,
  spotifyProduct: UserProfile['spotifyProduct'],
): UserProfile | undefined {
  if (!session?.user) return undefined;
  return {
    id: session.user.id,
    email: session.user.email,
    spotifyProduct,
    isPremium: spotifyProduct === 'premium',
  };
}
