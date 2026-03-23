import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { loadUserAppState, subscribeToUserAppState } from './lib/appSync';
import { buildUserProfile, clearSpotifySession, getAuthCallbackErrorMessage, getValidSpotifySession } from './lib/spotifyAuth';
import { ensureSupabaseAppSession, persistSpotifyToken } from './lib/supabase';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { BucketSetupPage } from './pages/BucketSetupPage';
import { LandingPage } from './pages/LandingPage';
import { MatchPage } from './pages/MatchPage';
import { RankingPage } from './pages/RankingPage';
import { useAppStore } from './store/appStore';

function RequireSource({ children }: { children: React.ReactNode }) {
  const activeSource = useAppStore((s) => s.activeSource);
  if (!activeSource) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function hasAuthCallbackError(search: string, hash: string) {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return Boolean(
    searchParams.get('error_description') ??
    searchParams.get('error') ??
    hashParams.get('error_description') ??
    hashParams.get('error'),
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAppStore((s) => s.auth);
  const setAuth = useAppStore((s) => s.setAuth);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const hydrated = useAppStore((s) => s.hydrated);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const replaceRemoteState = useAppStore((s) => s.replaceRemoteState);
  const clearSyncedState = useAppStore((s) => s.clearSyncedState);
  const [sessionResolved, setSessionResolved] = useState(false);
  const isAuthCallback = location.pathname === '/auth/callback';
  const callbackHasError = hasAuthCallbackError(location.search, location.hash);
  const resolveGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const gen = ++resolveGenRef.current;
      setSessionResolved(false);

      try {
        const syncUserId = await ensureSupabaseAppSession().catch(() => undefined);
        const resolved = await buildUserProfile(syncUserId);
        const session = await getValidSpotifySession().catch(() => undefined);

        if (cancelled || gen !== resolveGenRef.current) return;

        if (!resolved || !session) {
          clearSpotifySession();
          setAuth(undefined);
          setUser(undefined);
          return;
        }

        setAuth(resolved.auth);
        setUser(resolved.user);

        if (resolved.auth.syncUserId && session.accessToken) {
          void persistSpotifyToken(resolved.auth.syncUserId, session.accessToken).catch((error) => {
            console.error('Failed to persist Spotify token.', error);
          });
        }
      } catch (error) {
        console.error('Failed to resolve Spotify session.', error);
        if (!cancelled && gen === resolveGenRef.current) {
          clearSpotifySession();
          setAuth(undefined);
          setUser(undefined);
        }
      } finally {
        if (!cancelled) {
          setSessionResolved(true);
        }
      }
    };

    void resolveSession();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void resolveSession();
      }
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [setAuth, setUser]);

  useEffect(() => {
    if (!sessionResolved) return;

    const remoteUserId = auth?.syncUserId;

    if (!auth || !user) {
      clearSyncedState();
      setHydrated(true);
      if (isAuthCallback && !callbackHasError && !getAuthCallbackErrorMessage()) {
        navigate('/', { replace: true });
      }
      return;
    }

    if (!remoteUserId) {
      setHydrated(true);
      return;
    }

    let cancelled = false;
    setHydrated(false);

    const reload = async (completeHydration: boolean) => {
      try {
        const remoteState = await loadUserAppState(remoteUserId);
        if (cancelled) return;
        replaceRemoteState(remoteState);

        if (auth.accessToken && remoteState.spotifyProviderToken !== auth.accessToken) {
          void persistSpotifyToken(remoteUserId, auth.accessToken).catch((error) => {
            console.error('Failed to persist refreshed Spotify token.', error);
          });
        }
      } catch (error) {
        console.error('Failed to load synced app state.', error);
      } finally {
        if (!cancelled && completeHydration) {
          setHydrated(true);
          if (isAuthCallback && !callbackHasError) {
            navigate('/', { replace: true });
          }
        }
      }
    };

    void reload(true);
    const unsubscribe = subscribeToUserAppState(remoteUserId, () => {
      void reload(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [auth, callbackHasError, clearSyncedState, isAuthCallback, navigate, replaceRemoteState, sessionResolved, setHydrated, user]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-50">
        <p className="text-sm text-warm-400">불러오는 중…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/bucket" element={<RequireSource><BucketSetupPage /></RequireSource>} />
        <Route path="/match" element={<RequireSource><MatchPage /></RequireSource>} />
        <Route path="/ranking" element={<RequireSource><RankingPage /></RequireSource>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
