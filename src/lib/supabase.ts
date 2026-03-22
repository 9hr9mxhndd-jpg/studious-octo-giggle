import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSnapshot, UserProfile } from '../types';
import { clearSpotifyDirectSession, isSpotifyDirectRedirectConfigured, signInWithSpotifyDirect } from './spotifyDirectAuth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const spotifyDirectAuthEnabled = import.meta.env.VITE_SPOTIFY_DIRECT_AUTH === 'true';

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
      '기본 로그인 흐름은 Supabase Spotify Social Login이에요. Spotify Redirect URI는 앱의 /auth/callback 이 아니라 Supabase callback URL로 유지해야 합니다.',
      '만약 기존 탭에서 같은 오류가 계속 보이면 브라우저에서 현재 /auth/callback 탭을 닫고 홈으로 돌아가서 다시 "Spotify로 시작하기"를 눌러주세요.',
      '직접 Spotify PKCE 로그인을 쓰려면 배포 환경에서 VITE_SPOTIFY_DIRECT_AUTH=true 를 설정하고, 해당 앱의 /auth/callback URL을 Spotify Redirect URI에 추가해야 합니다.',
    ],
  };
}

async function signInWithSupabaseSpotify() {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았어요.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      scopes: [
        'user-read-private',
        'user-read-email',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-library-read',
        'user-read-playback-state',
        'streaming',
        'user-modify-playback-state',
      ].join(' '),
      redirectTo: getSpotifyRedirectUrl(),
    },
  });

  if (error) throw error;
}

export async function signInWithSpotify() {
  if (spotifyDirectAuthEnabled) {
    const directConfigured = await isSpotifyDirectRedirectConfigured().catch(() => false);
    if (directConfigured) {
      await signInWithSpotifyDirect();
      return;
    }
  }

  await signInWithSupabaseSpotify();
}

export async function signOut() {
  clearSpotifyDirectSession();
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
