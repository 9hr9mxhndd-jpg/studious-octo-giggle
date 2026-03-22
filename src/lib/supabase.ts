import { createClient, type Session } from '@supabase/supabase-js';
import type { AuthSnapshot, UserProfile } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'implicit',     // PKCE 대신 implicit — SPA에서 code_verifier 유실 문제 해결
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // implicit flow는 hash fragment를 자동 감지
      },
    })
  : undefined;

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
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function sessionToAuthSnapshot(session: Session | null): AuthSnapshot | undefined {
  if (!session) return undefined;
  return {
    accessToken: session.provider_token ?? undefined,
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
