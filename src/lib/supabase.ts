import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSnapshot, UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SPOTIFY_PROVIDER_TOKEN_STORAGE_KEY = 'oauth_provider_token';
const SPOTIFY_PROVIDER_REFRESH_TOKEN_STORAGE_KEY = 'oauth_provider_refresh_token';
const SPOTIFY_CALLBACK_PATH = '/auth/callback';
const SPOTIFY_REQUIRED_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
] as const;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);
export const spotifyScopeString = SPOTIFY_REQUIRED_SCOPES.join(' ');

export const supabase = hasSupabaseEnv && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : undefined;

function isBrowser() {
  return typeof window !== 'undefined';
}

function readStorage(key: string) {
  if (!isBrowser()) return undefined;
  return window.localStorage.getItem(key) ?? undefined;
}

function writeStorage(key: string, value?: string) {
  if (!isBrowser()) return;

  if (!value) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function cacheProviderTokens(session: Session | null) {
  writeStorage(SPOTIFY_PROVIDER_TOKEN_STORAGE_KEY, session?.provider_token ?? undefined);
  writeStorage(SPOTIFY_PROVIDER_REFRESH_TOKEN_STORAGE_KEY, session?.provider_refresh_token ?? undefined);
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    cacheProviderTokens(session);

    const userId = session?.user?.id;
    const providerToken = session?.provider_token;
    if (userId && providerToken) {
      void persistSpotifyToken(userId, providerToken).catch(() => {});
    }
  });
}

export function loadSpotifyToken(): string | undefined {
  return readStorage(SPOTIFY_PROVIDER_TOKEN_STORAGE_KEY);
}

export function saveSpotifyToken(token: string) {
  writeStorage(SPOTIFY_PROVIDER_TOKEN_STORAGE_KEY, token);
}

export function clearSpotifyToken() {
  writeStorage(SPOTIFY_PROVIDER_TOKEN_STORAGE_KEY, undefined);
  writeStorage(SPOTIFY_PROVIDER_REFRESH_TOKEN_STORAGE_KEY, undefined);
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

  if (isBrowser()) {
    return window.location.origin;
  }

  return 'http://localhost:5173';
}

export function getSpotifyRedirectUrl() {
  const url = new URL(getBaseRedirectUrl());
  url.pathname = SPOTIFY_CALLBACK_PATH;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function readAuthCallbackParam(location: Location, key: string) {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  return searchParams.get(key) ?? hashParams.get(key) ?? undefined;
}

export function getAuthCallbackErrorMessage(location: Location = window.location) {
  const rawError = readAuthCallbackParam(location, 'error_description') ?? readAuthCallbackParam(location, 'error');
  return rawError ? decodeURIComponent(rawError.replace(/\+/g, ' ')) : undefined;
}

export function getAuthCallbackErrorCode(location: Location = window.location) {
  return readAuthCallbackParam(location, 'error_code');
}

export async function exchangeCodeForSessionIfPresent(location: Location = window.location) {
  if (!supabase) {
    return { errorMessage: 'Supabase 환경변수가 설정되지 않았어요.' };
  }

  const errorMessage = getAuthCallbackErrorMessage(location);
  if (errorMessage) {
    return { errorMessage };
  }

  const code = new URLSearchParams(location.search).get('code');
  if (!code) {
    return { errorMessage: '인증 코드가 없어 로그인 세션을 만들지 못했어요.' };
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error && data.session) {
    cacheProviderTokens(data.session);
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
  const isProviderConfigFailure =
    normalizedMessage.includes('provider') ||
    normalizedMessage.includes('redirect') ||
    normalizedMessage.includes('code verifier') ||
    normalizedMessage.includes('code challenge') ||
    normalizedCode === 'unexpected_failure';

  if (!isProviderConfigFailure) {
    return undefined;
  }

  return {
    title: 'Spotify OAuth 설정을 다시 확인해주세요.',
    items: [
      'Spotify Developer Dashboard의 Redirect URI는 Supabase callback URL(https://<project-ref>.supabase.co/auth/v1/callback)이어야 합니다.',
      'Supabase Authentication > URL Configuration에는 현재 앱의 /auth/callback URL이 Redirect URL로 등록되어 있어야 합니다.',
      '프리뷰 배포를 사용한다면 Supabase Redirect URLs에 해당 프리뷰 도메인(/auth/callback 포함)도 추가해야 합니다.',
      'Supabase Authentication > Providers > Spotify에 Spotify Client ID와 Client Secret이 정확히 저장되어 있는지 확인해주세요.',
    ],
  };
}

export async function signInWithSpotify() {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았어요.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo: getSpotifyRedirectUrl(),
      scopes: spotifyScopeString,
      queryParams: {
        show_dialog: 'true',
      },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  clearSpotifyToken();
  if (!supabase) return;

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
    refreshToken: session.provider_refresh_token ?? readStorage(SPOTIFY_PROVIDER_REFRESH_TOKEN_STORAGE_KEY),
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
