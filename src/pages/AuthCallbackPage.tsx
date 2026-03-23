import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  exchangeCodeForSpotifySession,
  getAuthCallbackErrorCode,
  getAuthCallbackErrorMessage,
  signInWithSpotify,
} from '../lib/spotifyAuth';

function getSpotifyLoginTroubleshooting(errorMessage?: string, errorCode?: string) {
  if (!errorMessage) return undefined;

  const normalizedMessage = errorMessage.toLowerCase();
  const normalizedCode = errorCode?.toLowerCase();
  const isProviderConfigFailure =
    normalizedMessage.includes('redirect') ||
    normalizedMessage.includes('code verifier') ||
    normalizedMessage.includes('code challenge') ||
    normalizedMessage.includes('state') ||
    normalizedCode === 'invalid_client';

  if (!isProviderConfigFailure) {
    return undefined;
  }

  return {
    title: 'Spotify PKCE 설정을 다시 확인해주세요.',
    items: [
      'Spotify Developer Dashboard Redirect URI에 현재 앱의 /auth/callback URL이 정확히 등록되어 있어야 합니다.',
      'VITE_SPOTIFY_CLIENT_ID가 현재 Spotify 앱의 Client ID와 정확히 일치해야 합니다.',
      '브라우저 로컬스토리지의 이전 PKCE state/code_verifier가 꼬였을 수 있으니 새 로그인으로 다시 시도해주세요.',
      'Spotify 앱이 Development Mode라면 현재 테스트 계정이 User Management에 등록되어 있어야 합니다.',
    ],
  };
}

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
      const { errorMessage: nextErrorMessage } = await exchangeCodeForSpotifySession();
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
      <p className="text-sm text-warm-400">Spotify 로그인 코드를 PKCE 세션으로 교환하는 중…</p>
    </div>
  );
}
