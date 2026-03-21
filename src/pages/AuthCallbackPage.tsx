import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpotifyProduct } from '../lib/spotify';
import { profileFromSession, sessionToAuthSnapshot, supabase } from '../lib/supabase';
import { useAppStore } from '../store/appStore';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAppStore((state) => state.setAuth);
  const setUser = useAppStore((state) => state.setUser);
  const setHydrated = useAppStore((state) => state.setHydrated);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      if (!supabase) {
        const message = 'Spotify login is unavailable until Supabase environment variables are configured.';
        console.error(message);
        if (!cancelled) {
          setErrorMessage(message);
          setHydrated(true);
        }
        return;
      }

      try {
        const callbackUrl = new URL(window.location.href);
        const code = callbackUrl.searchParams.get('code');
        const callbackError = callbackUrl.searchParams.get('error_description') ?? callbackUrl.searchParams.get('error');

        if (callbackError) {
          throw new Error(callbackError);
        }

        if (!code) {
          throw new Error('Missing OAuth code in callback URL.');
        }

        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }

        const session = exchangeData.session;
        if (!session) {
          throw new Error('Spotify login completed, but no authenticated session was returned.');
        }

        const auth = sessionToAuthSnapshot(session);
        const product = await getSpotifyProduct(auth?.accessToken);

        if (!cancelled) {
          setAuth(auth);
          setUser(profileFromSession(session, product));
          setHydrated(true);
          navigate('/setup/playlist', { replace: true });
        }
      } catch (error) {
        console.error('Spotify auth callback failed:', error);
        if (!cancelled) {
          setAuth(undefined);
          setUser(undefined);
          setHydrated(true);
          setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
        }
      }
    }

    void handleCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate, setAuth, setHydrated, setUser]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      {errorMessage ?? 'Loading app…'}
    </div>
  );
}
