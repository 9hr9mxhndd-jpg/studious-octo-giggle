import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv && supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : undefined;

export async function ensureSupabaseAppSession() {
  if (!supabase) return undefined;

  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) {
    return data.session.user.id;
  }

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }

  return signInData.user?.id;
}

export async function persistSpotifyToken(userId: string, token?: string) {
  if (!supabase) return;

  const { error } = await supabase.from('sorter_state').upsert({
    user_id: userId,
    spotify_provider_token: token ?? null,
  }, { onConflict: 'user_id' });

  if (error) throw error;
}

export async function signOutAppSession() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
