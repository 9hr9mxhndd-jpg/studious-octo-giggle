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
        detectSessionInUrl: false, // 수동으로 처리 — 자동 감지 끔
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
  const redirectUrl = new URL(getBaseRedirectUrl());
  redirectUrl.pathname = '/auth/callback';
  redirectUrl.search = '';
  redirectUrl.hash = '';
  return redirectUrl.toString();
}

export async function signInWithSpotify() {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았어요.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      scopes: 'user-read-private user-read-email playlist-read-private streaming user-modify-playback-state user-library-read',
      redirectTo: getSpotifyRedirectUrl(),
      queryParams: { show_dialog: 'true' },
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
