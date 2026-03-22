import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const errorMessage = useMemo(() => {
    if (!supabase) {
      return 'Supabase 환경변수가 설정되지 않았어요.';
    }

    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error_description') ?? params.get('error');

    return urlError ? decodeURIComponent(urlError) : undefined;
  }, []);

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
