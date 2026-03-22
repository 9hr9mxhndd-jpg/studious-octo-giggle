import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    if (!supabase) {
      setErrorMessage('Supabase 환경변수가 설정되지 않았어요.');
      return;
    }

    // detectSessionInUrl: true 가 자동으로 code를 교환하고
    // SIGNED_IN 이벤트를 발생시킴 — 여기선 그냥 기다리면 됨
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/', { replace: true });
      }
      if (event === 'SIGNED_OUT') {
        navigate('/', { replace: true });
      }
    });

    // URL에 error 파라미터가 있으면 표시
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error_description') ?? params.get('error');
    if (err) {
      setErrorMessage(decodeURIComponent(err));
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (errorMessage) {
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
