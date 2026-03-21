import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { getSpotifyProduct } from './lib/spotify';
import { profileFromSession, sessionToAuthSnapshot, supabase } from './lib/supabase';
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
  const setUser = useAppStore((s) => s.setUser);
  const hydrated = useAppStore((s) => s.hydrated);
  const setHydrated = useAppStore((s) => s.setHydrated);

  useEffect(() => {
    if (!supabase) { setHydrated(true); return; }
    const client = supabase;
    let cancelled = false;

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      const auth = sessionToAuthSnapshot(session);
      setAuth(auth);
      void getSpotifyProduct(auth?.accessToken)
        .then((product) => { setUser(profileFromSession(session, product)); })
        .catch(() => { setUser(profileFromSession(session, 'unknown')); });

      if (event === 'SIGNED_IN' && location.pathname === '/auth/callback') {
        navigate('/', { replace: true });
      }
      if (event === 'SIGNED_OUT') {
        navigate('/', { replace: true });
      }
    });

    async function syncSession() {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const auth = sessionToAuthSnapshot(data.session);
        const product = await getSpotifyProduct(auth?.accessToken);
        if (!cancelled) { setAuth(auth); setUser(profileFromSession(data.session, product)); setHydrated(true); }
      } catch {
        if (!cancelled) { setAuth(undefined); setUser(undefined); setHydrated(true); }
      }
    }
    void syncSession();
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [location.pathname, navigate, setAuth, setHydrated, setUser]);

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
