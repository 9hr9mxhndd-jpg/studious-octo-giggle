import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { loadUserAppState, subscribeToUserAppState } from './lib/appSync';
import { getSpotifyProduct } from './lib/spotify';
import { clearSpotifyToken, loadSpotifyToken, profileFromSession, saveSpotifyToken, sessionToAuthSnapshot, supabase } from './lib/supabase';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { BucketSetupPage } from './pages/BucketSetupPage';
import { LandingPage } from './pages/LandingPage';
import { MatchPage } from './pages/MatchPage';
import { RankingPage } from './pages/RankingPage';
import { useAppStore } from './store/appStore';
import type { SpotifyProduct, UserProfile } from './types';

function RequireSource({ children }: { children: React.ReactNode }) {
  const activeSource = useAppStore((s) => s.activeSource);
  if (!activeSource) return <Navigate to="/" replace />;
  return <>{children}</>;
}


function resolveSpotifyProduct(nextProduct: SpotifyProduct, previousUser?: UserProfile) {
  if (nextProduct !== 'unknown') return nextProduct;
  return previousUser?.spotifyProduct ?? 'unknown';
}

function applySpotifyProduct(
  user: UserProfile | undefined,
  spotifyProduct: SpotifyProduct,
  previousUser?: UserProfile,
) {
  if (!user) return undefined;

  const resolvedProduct = resolveSpotifyProduct(spotifyProduct, previousUser ?? user);
  return {
    ...user,
    spotifyProduct: resolvedProduct,
    isPremium: resolvedProduct === 'premium',
  };
}

function hasAuthCallbackError(search: string) {
  const params = new URLSearchParams(search);
  return Boolean(params.get('error_description') ?? params.get('error'));
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAppStore((s) => s.setAuth);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const hydrated = useAppStore((s) => s.hydrated);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const replaceRemoteState = useAppStore((s) => s.replaceRemoteState);
  const clearSyncedState = useAppStore((s) => s.clearSyncedState);
  const [sessionResolved, setSessionResolved] = useState(!supabase);
  const isAuthCallback = location.pathname === '/auth/callback';
  const callbackHasError = hasAuthCallbackError(location.search);

  useEffect(() => {
    if (!supabase) {
      setAuth(undefined);
      setUser(undefined);
      setSessionResolved(true);
      return;
    }

    const client = supabase;
    let cancelled = false;

    const syncSession = async (session: Session | null) => {
      try {
        const nextAuth = await sessionToAuthSnapshot(session);
        const product = await getSpotifyProduct(nextAuth?.accessToken).catch(() => 'unknown' as const);
        if (!cancelled) {
          setAuth(nextAuth);
          const currentUser = useAppStore.getState().user;
          setUser(applySpotifyProduct(
            profileFromSession(session, product),
            product,
            currentUser,
          ));
        }
      } catch {
        if (!cancelled) {
          setAuth(undefined);
          setUser(undefined);
        }
      }
    };

    const resolveSession = async (sessionOverride?: Session | null) => {
      setSessionResolved(false);
      try {
        const session = sessionOverride ?? (await client.auth.getSession()).data.session;
        await syncSession(session);
      } catch {
        if (!cancelled) {
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

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      void resolveSession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setAuth, setUser]);

  useEffect(() => {
    if (!sessionResolved) return;

    if (!supabase) {
      setHydrated(true);
      if (isAuthCallback && !callbackHasError) {
        navigate('/', { replace: true });
      }
      return;
    }

    if (!user?.id) {
      clearSpotifyToken();
      clearSyncedState();
      setHydrated(true);
      if (isAuthCallback && !callbackHasError) {
        navigate('/', { replace: true });
      }
      return;
    }

    let cancelled = false;
    setHydrated(false);

    const updateUserAuthFromRemoteToken = async (remoteToken?: string) => {
      if (!remoteToken) return;

      saveSpotifyToken(remoteToken);

      const currentAuth = useAppStore.getState().auth;
      setAuth(currentAuth
        ? { ...currentAuth, accessToken: remoteToken }
        : { accessToken: remoteToken, refreshToken: undefined });

      const product = await getSpotifyProduct(remoteToken).catch(() => 'unknown' as const);
      if (cancelled) return;

      const currentUser = useAppStore.getState().user;
      if (currentUser?.id !== user.id) return;

      setUser(applySpotifyProduct(currentUser, product, currentUser));
    };

    const reload = async (completeHydration: boolean) => {
      try {
        const remoteState = await loadUserAppState(user.id);
        if (cancelled) return;

        replaceRemoteState(remoteState);
        await updateUserAuthFromRemoteToken(remoteState.spotifyProviderToken ?? loadSpotifyToken());
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
    const unsubscribe = subscribeToUserAppState(user.id, () => {
      void reload(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [callbackHasError, clearSyncedState, isAuthCallback, navigate, replaceRemoteState, sessionResolved, setAuth, setHydrated, setUser, user?.id]);

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
