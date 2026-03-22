import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpotifyProduct } from '../lib/spotify';
import { profileFromSession, sessionToAuthSnapshot, supabase } from '../lib/supabase';
import { useAppStore } from '../store/appStore';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAppStore((s) => s.setAuth);
  const setUser = useAppStore((s) => s.setUser);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function handle() {
      if (!supabase) {
        setStatus('error');
        setErrorMessage('Supabase 환경변수가 설정되지 않았어요.');
        return;
      }

      // URL에 error가 있으면 즉시 표시
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get('error_description') ?? params.get('error');
      if (urlError) {
        setStatus('error');
        setErrorMessage(decodeURIComponent(urlError));
        return;
      }

      const code = params.get('code');
      if (!code) {
        setStatus('error');
        setErrorMessage('URL에 인증 코드가 없어요.');
        return;
      }

      try {
        // detectSessionInUrl: false 이므로 여기서 직접 한 번만 교환
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const session = data.session;
        if (!session) throw new Error('세션을 받아오지 못했어요.');

        const auth = sessionToAuthSnapshot(session);
        const product = await getSpotifyProduct(auth?.accessToken).catch(() => 'unknown' as const);

        if (!cancelled) {
          setAuth(auth);
          setUser(profileFromSession(session, product));
          setHydrated(true);
          navigate('/', { replace: true });
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(e instanceof Error ? e.message : '로그인 중 오류가 발생했어요.');
          setHydrated(true);
        }
      }
    }

    void handle();
    return () => { cancelled = true; };
  }, [navigate, setAuth, setHydrated, setUser]);

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-warm-50">
        <p className="text-sm text-red-500">{errorMessage}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded-full border border-warm-200 px-4 py-2 text-xs text-warm-500"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-warm-50">
      <p className="text-sm text-warm-400">로그인 처리 중…</p>
    </div>
  );
}
