import { useEffect } from 'react';
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

function RequireSource({ children }: { children: React.ReactNode }) {
  const activeSource = useAppStore((s) => s.activeSource);
  if (!activeSource) return <Navigate to="/" replace />;
  return <>{children}</>;
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

  useEffect(() => {
    if (!supabase) {
      setHydrated(true);
      return;
    }

    const client = supabase;
    let cancelled = false;

    const syncSession = async (sessionOverride?: Awaited<ReturnType<typeof client.auth.getSession>>['data']['session']) => {
      try {
        const session = sessionOverride ?? (await client.auth.getSession()).data.session;
        const nextAuth = await sessionToAuthSnapshot(session);
        const product = await getSpotifyProduct(nextAuth?.accessToken);
        if (!cancelled) {
          setAuth(nextAuth);
          setUser(profileFromSession(session, product));
        }
      } catch {
        if (!cancelled) {
          setAuth(undefined);
          setUser(undefined);
        }
      }
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      void syncSession(session);

      if (event === 'SIGNED_IN' && location.pathname === '/auth/callback') {
        navigate('/', { replace: true });
      }
      if (event === 'SIGNED_OUT') {
        clearSpotifyToken();
        clearSyncedState();
        setHydrated(true);
        navigate('/', { replace: true });
      }
    });

    void syncSession().finally(() => {
      if (!cancelled && !user?.id) {
        setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [clearSyncedState, location.pathname, navigate, setAuth, setHydrated, setUser, user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      if (!user) {
        clearSyncedState();
        setHydrated(true);
      }
      return;
    }

    let cancelled = false;
    setHydrated(false);

    const reload = async () => {
      try {
        const remoteState = await loadUserAppState(user.id);
        if (cancelled) return;
        replaceRemoteState(remoteState);
        const remoteToken = remoteState.spotifyProviderToken ?? loadSpotifyToken();
        if (remoteToken) {
          saveSpotifyToken(remoteToken);
          setAuth({ ...useAppStore.getState().auth, accessToken: remoteToken });
          const product = await getSpotifyProduct(remoteToken);
          if (!cancelled && user) {
            setUser({ ...user, spotifyProduct: product, isPremium: product === 'premium' });
          }
        }
      } catch (error) {
        console.error('Failed to load synced app state.', error);
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    };

    void reload();
    const unsubscribe = subscribeToUserAppState(user.id, () => {
      void reload();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [clearSyncedState, replaceRemoteState, setAuth, setHydrated, setUser, user?.id]);

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
