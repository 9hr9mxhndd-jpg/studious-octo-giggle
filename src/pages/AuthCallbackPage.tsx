import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  exchangeCodeForSessionIfPresent,
  getAuthCallbackErrorCode,
  getAuthCallbackErrorMessage,
  getSpotifyLoginTroubleshooting,
  signInWithSpotify,
  supabase,
} from '../lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(() => getAuthCallbackErrorMessage());
  const [errorCode] = useState<string | undefined>(() => getAuthCallbackErrorCode());
  const troubleshooting = useMemo(
    () => getSpotifyLoginTroubleshooting(errorMessage, errorCode),
    [errorCode, errorMessage],
  );

  useEffect(() => {
    let cancelled = false;

    const resolveCallback = async () => {
      if (!supabase) {
        if (!cancelled) {
          setErrorMessage('Supabase 환경변수가 설정되지 않았어요.');
        }
        return;
      }

      const { errorMessage: nextErrorMessage } = await exchangeCodeForSessionIfPresent();
      if (cancelled) return;

      if (nextErrorMessage) {
        setErrorMessage(nextErrorMessage);
        return;
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      navigate('/', { replace: true });
    };

    if (!errorMessage) {
      void resolveCallback();
    }

    return () => {
      cancelled = true;
    };
  }, [errorMessage, navigate]);

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-red-600">Spotify 로그인에 실패했어요.</p>
          <p className="mt-2 text-sm text-warm-600">{errorMessage}</p>
          {troubleshooting ? (
            <div className="mt-4 rounded-2xl border border-warm-100 bg-warm-50 p-4">
              <p className="text-xs font-semibold text-warm-700">{troubleshooting.title}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-warm-500">
                {troubleshooting.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(undefined);
                void signInWithSpotify().catch((error: unknown) => {
                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : 'Spotify 로그인을 다시 시작하지 못했어요. 잠시 후 다시 시도해주세요.',
                  );
                });
              }}
              className="rounded-full bg-warm-800 px-4 py-2 text-xs font-semibold text-white hover:bg-warm-900"
            >
              Spotify로 다시 시도
            </button>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="rounded-full border border-warm-200 px-4 py-2 text-xs text-warm-500 hover:text-warm-700"
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-warm-50">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-warm-700" />
      <p className="text-sm text-warm-400">Spotify 로그인 코드를 Supabase 세션으로 교환하는 중…</p>
    </div>
  );
}
