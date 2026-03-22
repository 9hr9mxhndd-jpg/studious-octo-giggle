import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSnapshot, UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return {
    errorMessage: error ? error.message : undefined,
  };
}

export function getSpotifyLoginTroubleshooting(errorMessage?: string) {
  if (!errorMessage) return undefined;

  const normalizedMessage = errorMessage.toLowerCase();
  if (!normalizedMessage.includes('external provider')) {
    return undefined;
  }

  return [
    'Spotify Developer Dashboard의 Redirect URI는 Supabase 프로젝트의 OAuth Callback URL(https://<project-ref>.supabase.co/auth/v1/callback)이어야 해요.',
    '앱의 /auth/callback 주소는 Spotify가 아니라 Supabase Auth의 Redirect URLs 허용 목록에만 추가해야 해요.',
    'Spotify provider의 Client ID / Client Secret이 최근에 바뀌었다면 Supabase Dashboard > Authentication > Providers > Spotify에도 동일하게 다시 저장해주세요.',
  ];
}

export async function signInWithSpotify() {
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

export async function signOut() {
  if (!supabase) return;
  clearSpotifyToken();
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
