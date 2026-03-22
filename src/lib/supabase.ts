import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSnapshot, UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : undefined;

// ── Spotify provider_token은 implicit flow에서 최초 1회만 session에 포함됨
//    이후 getSession() 복원 시 null이 되므로 localStorage에 별도 저장
const SPOTIFY_TOKEN_KEY = 'spotify_provider_token';

export function saveSpotifyToken(token: string) {
  try { localStorage.setItem(SPOTIFY_TOKEN_KEY, token); } catch {}
}

export function loadSpotifyToken(): string | undefined {
  try { return localStorage.getItem(SPOTIFY_TOKEN_KEY) ?? undefined; } catch { return undefined; }
}

export function clearSpotifyToken() {
  try { localStorage.removeItem(SPOTIFY_TOKEN_KEY); } catch {}
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

export function sessionToAuthSnapshot(session: Session | null): AuthSnapshot | undefined {
  if (!session) return undefined;

  // provider_token이 있으면 저장, 없으면 이전에 저장된 값 사용
  const providerToken = session.provider_token ?? undefined;
  if (providerToken) {
    saveSpotifyToken(providerToken);
  }

  return {
    accessToken: providerToken ?? loadSpotifyToken(),
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
