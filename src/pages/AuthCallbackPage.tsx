import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  exchangeCodeForSessionIfPresent,
  getAuthCallbackErrorCode,
  getAuthCallbackErrorMessage,
  clearPendingSpotifyOAuthAttempt,
  getSpotifyLoginTroubleshooting,
  markSpotifyOAuthRetry,
  shouldRetrySpotifyOAuth,
  signInWithSpotify,
  supabase,
} from '../lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(() => getAuthCallbackErrorMessage());
  const [errorCode] = useState<string | undefined>(() => getAuthCallbackErrorCode());
  const [exchanging, setExchanging] = useState(!getAuthCallbackErrorMessage());
  const [retrying, setRetrying] = useState(false);
  const retriedRef = useRef(false);
  const troubleshooting = useMemo(
    () => getSpotifyLoginTroubleshooting(errorMessage, errorCode),
    [errorCode, errorMessage],
  );

  useEffect(() => {
    if (errorMessage) {
      const shouldRetry = !retriedRef.current && shouldRetrySpotifyOAuth(errorMessage, errorCode);
      if (shouldRetry) {
        retriedRef.current = true;
        markSpotifyOAuthRetry();
        setRetrying(true);
        setExchanging(true);
        void signInWithSpotify({ preserveRetryCount: true })
          .catch((error: unknown) => {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : 'Spotify 로그인을 다시 시작하지 못했어요. 잠시 후 다시 시도해주세요.',
            );
            setRetrying(false);
            setExchanging(false);
          });
        return;
      }

      setExchanging(false);
      setRetrying(false);
      return;
    }

    let cancelled = false;

    if (!supabase) {
      setErrorMessage('Supabase 환경변수가 설정되지 않았어요.');
      setExchanging(false);
      setRetrying(false);
      return;
    }

    void Promise.resolve()
      .then(async () => {
        const { errorMessage: nextErrorMessage } = await exchangeCodeForSessionIfPresent();
        if (cancelled) return;

        if (nextErrorMessage) {
          setErrorMessage(nextErrorMessage);
          setExchanging(false);
          setRetrying(false);
          return;
        }

        clearPendingSpotifyOAuthAttempt();
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
        setRetrying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [errorMessage, navigate]);

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-warm-50 px-6">
        <div className="max-w-xl rounded-3xl border border-red-200 bg-white p-6 text-left shadow-sm">
          <p className="text-sm font-semibold text-red-600">Spotify 로그인을 완료하지 못했어요.</p>
          {errorCode ? (
            <p className="mt-2 text-xs text-warm-400">오류 코드: {errorCode}</p>
          ) : null}
          <p className="mt-3 text-sm leading-6 text-red-500">{errorMessage}</p>
        </div>
        {troubleshooting ? (
          <div className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-xs leading-6 text-amber-900">
            <p className="mb-2 font-semibold">{troubleshooting.title}</p>
            <ul className="list-disc space-y-1 pl-5">
              {troubleshooting.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setRetrying(true);
              setExchanging(true);
              clearPendingSpotifyOAuthAttempt();
              void signInWithSpotify({ preserveRetryCount: true })
                .catch((error: unknown) => {
                  setErrorMessage(
                    error instanceof Error
                      ? error.message
                      : 'Spotify 로그인을 다시 시작하지 못했어요. 잠시 후 다시 시도해주세요.',
                  );
                  setRetrying(false);
                  setExchanging(false);
                });
            }}
            className="rounded-full bg-warm-800 px-4 py-2 text-xs font-semibold text-white hover:bg-warm-900"
          >
            Spotify로 다시 시도
          </button>
          <button
            type="button"
            onClick={() => {
              clearPendingSpotifyOAuthAttempt();
              navigate('/', { replace: true });
            }}
            className="rounded-full border border-warm-200 px-4 py-2 text-xs text-warm-500 hover:text-warm-700"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-warm-50">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-warm-700" />
      <p className="text-sm text-warm-400">
        {retrying
          ? 'Spotify 로그인을 한 번 더 시도하는 중…'
          : exchanging
            ? 'Spotify 로그인 세션을 확인하는 중…'
            : '로그인 처리 중…'}
      </p>
    </div>
  );
}
