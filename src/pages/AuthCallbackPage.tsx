import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpotifyProduct } from '../lib/spotify';
import { profileFromSession, sessionToAuthSnapshot, supabase } from '../lib/supabase';
import { useAppStore } from '../store/appStore';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAppStore((s) => s.setAuth);
  const setUser = useAppStore((s) => s.setUser);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const [errorMessage, setErrorMessage] = useState<string>();
  const handled = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setErrorMessage('Supabase 환경변수가 설정되지 않았어요.');
      return;
    }

    // URL에 에러 파라미터 확인
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error_description') ?? params.get('error');
    if (urlError) {
      setErrorMessage(decodeURIComponent(urlError));
      return;
    }

    async function finishLogin() {
      if (handled.current || !supabase) return;
      handled.current = true;

      try {
        // implicit flow: detectSessionInUrl이 hash fragment에서 토큰을 자동 추출
        // 이미 처리됐을 수 있으므로 현재 세션 먼저 확인
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          const auth = await sessionToAuthSnapshot(session);
          const product = await getSpotifyProduct(auth?.accessToken).catch(() => 'unknown' as const);
          setAuth(auth);
          setUser(profileFromSession(session, product));
          setHydrated(true);
          navigate('/', { replace: true });
          return;
        }

        // 세션이 아직 없으면 SIGNED_IN 이벤트 대기 (detectSessionInUrl이 처리하는 중)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (event === 'SIGNED_IN' && newSession) {
            subscription.unsubscribe();
            const auth = await sessionToAuthSnapshot(newSession);
            const product = await getSpotifyProduct(auth?.accessToken).catch(() => 'unknown' as const);
            setAuth(auth);
            setUser(profileFromSession(newSession, product));
            setHydrated(true);
            navigate('/', { replace: true });
          }
        });

        // 5초 타임아웃 — 이벤트가 오지 않으면 에러 표시
        setTimeout(() => {
          subscription.unsubscribe();
          if (handled.current) {
            setErrorMessage('로그인 처리 시간이 초과됐어요. 다시 시도해주세요.');
          }
        }, 5000);

      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : '로그인 중 오류가 발생했어요.');
        setHydrated(true);
      }
    }

    void finishLogin();
  }, [navigate, setAuth, setHydrated, setUser]);

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-warm-50">
        <p className="max-w-xs text-center text-sm text-red-500">{errorMessage}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded-full border border-warm-200 px-4 py-2 text-xs text-warm-500 hover:text-warm-700"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-warm-50">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-warm-700" />
      <p className="text-sm text-warm-400">로그인 처리 중…</p>
    </div>
  );
}
