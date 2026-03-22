import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  exchangeCodeForSessionIfPresent,
  getAuthCallbackErrorMessage,
  getSpotifyLoginTroubleshooting,
  supabase,
} from '../lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(() => getAuthCallbackErrorMessage());
  const [exchanging, setExchanging] = useState(Boolean(supabase) && !getAuthCallbackErrorMessage());
  const troubleshooting = useMemo(
    () => getSpotifyLoginTroubleshooting(errorMessage),
    [errorMessage],
  );

  useEffect(() => {
    if (!supabase) {
      setErrorMessage('Supabase 환경변수가 설정되지 않았어요.');
      setExchanging(false);
      return;
    }

    if (errorMessage) {
      setExchanging(false);
      return;
    }

    let cancelled = false;

    void exchangeCodeForSessionIfPresent()
      .then(({ errorMessage: nextErrorMessage }) => {
        if (cancelled) return;

        if (nextErrorMessage) {
          setErrorMessage(nextErrorMessage);
          setExchanging(false);
          return;
        }

        navigate('/', { replace: true });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : '로그인 세션을 완료하지 못했어요. 다시 시도해주세요.',
        );
        setExchanging(false);
      });

    return () => {
      cancelled = true;
    };
  }, [errorMessage, navigate]);

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-warm-50 px-6">
        <p className="max-w-lg text-center text-sm text-red-500">{errorMessage}</p>
        {troubleshooting ? (
          <div className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-xs leading-6 text-amber-900">
            <p className="mb-2 font-semibold">확인해볼 설정</p>
            <ul className="list-disc space-y-1 pl-5">
              {troubleshooting.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
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
      <p className="text-sm text-warm-400">
        {exchanging ? 'Spotify 로그인 세션을 확인하는 중…' : '로그인 처리 중…'}
      </p>
    </div>
  );
}
