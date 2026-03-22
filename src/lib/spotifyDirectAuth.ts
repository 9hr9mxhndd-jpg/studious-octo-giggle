import type { AuthSnapshot, SpotifyProduct, UserProfile } from '../types';
import { clearSpotifyToken, ensureSupabaseSession, getSpotifyRedirectUrl, saveSpotifyToken } from './supabase';

const CLIENT_ID_ENDPOINT = '/api/spotify-client-id';
const SESSION_STORAGE_KEY = 'spotify-direct-session';
const PENDING_AUTH_STORAGE_KEY = 'spotify-direct-pkce';
const EXPIRY_SKEW_MS = 60_000;
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-state',
  'streaming',
  'user-modify-playback-state',
].join(' ');

interface PendingSpotifyAuth {
  codeVerifier: string;
  redirectUri: string;
  state: string;
}

interface SpotifyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface StoredSpotifyDirectSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: UserProfile;
}

interface SpotifyProfileResponse {
  id?: string;
  email?: string;
  product?: SpotifyProduct;
}

let spotifyClientConfigPromise: Promise<{
  clientId: string;
  directRedirectConfigured: boolean;
}> | undefined;

function isBrowser() {
  return typeof window !== 'undefined';
}

function readJson<T>(key: string): T | undefined {
  if (!isBrowser()) return undefined;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeItem(key: string) {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
}

function createRandomString(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createCodeChallenge(verifier: string) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toBase64Url(new Uint8Array(digest));
}

async function getSpotifyClientConfig() {
  if (!spotifyClientConfigPromise) {
    spotifyClientConfigPromise = fetch(`${CLIENT_ID_ENDPOINT}?redirect_uri=${encodeURIComponent(getSpotifyRedirectUrl())}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Spotify 로그인 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
        }
        const data = (await response.json()) as {
          clientId?: string;
          directRedirectConfigured?: boolean;
        };
        if (!data.clientId) {
          throw new Error('Spotify Client ID를 확인하지 못했어요.');
        }
        return {
          clientId: data.clientId,
          directRedirectConfigured: Boolean(data.directRedirectConfigured),
        };
      })
      .catch((error: unknown) => {
        spotifyClientConfigPromise = undefined;
        throw error;
      });
  }

  return spotifyClientConfigPromise;
}

export async function isSpotifyDirectRedirectConfigured() {
  const config = await getSpotifyClientConfig();
  return config.directRedirectConfigured;
}

async function getSpotifyClientId() {
  const config = await getSpotifyClientConfig();
  return config.clientId;
}

function getPendingSpotifyAuth() {
  return readJson<PendingSpotifyAuth>(PENDING_AUTH_STORAGE_KEY);
}

function setPendingSpotifyAuth(value: PendingSpotifyAuth) {
  writeJson(PENDING_AUTH_STORAGE_KEY, value);
}

function clearPendingSpotifyAuth() {
  removeItem(PENDING_AUTH_STORAGE_KEY);
}

function getStoredSession() {
  return readJson<StoredSpotifyDirectSession>(SESSION_STORAGE_KEY);
}

function setStoredSession(session: StoredSpotifyDirectSession) {
  writeJson(SESSION_STORAGE_KEY, session);
  saveSpotifyToken(session.accessToken);
}

export function clearSpotifyDirectSession() {
  clearPendingSpotifyAuth();
  removeItem(SESSION_STORAGE_KEY);
  clearSpotifyToken();
}

function buildDirectAuthSnapshot(session: StoredSpotifyDirectSession): AuthSnapshot {
  return {
    provider: 'spotify-direct',
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

async function attachSupabaseUser(profile: UserProfile): Promise<UserProfile> {
  const session = await ensureSupabaseSession();
  const supabaseUserId = session?.user?.id;
  if (!supabaseUserId) {
    throw new Error('Supabase anonymous 세션을 만들지 못했어요. Auth 설정에서 Anonymous sign-ins 를 켜주세요.');
  }

  return {
    ...profile,
    id: supabaseUserId,
  };
}

async function exchangeToken(body: URLSearchParams) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as SpotifyTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? 'Spotify 토큰을 발급받지 못했어요. 다시 시도해주세요.');
  }

  return payload;
}

async function fetchSpotifyProfile(accessToken: string): Promise<UserProfile> {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as SpotifyProfileResponse & {
    error?: { message?: string };
  };

  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? 'Spotify 프로필을 불러오지 못했어요.');
  }

  const spotifyProduct = payload.product ?? 'unknown';
  return {
    id: payload.id,
    email: payload.email,
    spotifyProduct,
    isPremium: spotifyProduct === 'premium',
  };
}

async function refreshStoredSession(session: StoredSpotifyDirectSession) {
  if (session.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
    saveSpotifyToken(session.accessToken);
    return session;
  }

  if (!session.refreshToken) {
    clearSpotifyDirectSession();
    return undefined;
  }

  const clientId = await getSpotifyClientId();
  const token = await exchangeToken(
    new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  ).catch(() => undefined);

  if (!token?.access_token) {
    clearSpotifyDirectSession();
    return undefined;
  }

  const nextSession: StoredSpotifyDirectSession = {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
  setStoredSession(nextSession);
  return nextSession;
}

export async function restoreSpotifyDirectSession(): Promise<{
  auth: AuthSnapshot;
  user: UserProfile;
} | undefined> {
  const stored = getStoredSession();
  if (!stored) return undefined;

  const session = await refreshStoredSession(stored);
  if (!session) return undefined;

  const user = await attachSupabaseUser(session.user);
  if (user.id !== session.user.id) {
    const nextSession = { ...session, user };
    setStoredSession(nextSession);
    return {
      auth: buildDirectAuthSnapshot(nextSession),
      user,
    };
  }

  return {
    auth: buildDirectAuthSnapshot(session),
    user,
  };
}

export async function refreshSpotifyDirectAccessToken(currentToken: string) {
  const stored = getStoredSession();
  if (!stored || stored.accessToken !== currentToken) return undefined;

  const refreshed = await refreshStoredSession(stored);
  return refreshed?.accessToken;
}

export async function signInWithSpotifyDirect() {
  const redirectUri = getSpotifyRedirectUrl();
  const { clientId, directRedirectConfigured } = await getSpotifyClientConfig();
  if (!directRedirectConfigured) {
    throw new Error('Spotify Redirect URI에 현재 앱의 /auth/callback 주소가 등록되지 않았어요.');
  }

  const codeVerifier = createRandomString(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createRandomString(24);

  setPendingSpotifyAuth({
    codeVerifier,
    redirectUri,
    state,
  });

  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SPOTIFY_SCOPES);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('state', state);
  url.searchParams.set('show_dialog', 'true');

  window.location.assign(url.toString());
}

export async function exchangeSpotifyDirectCodeForSessionIfPresent(
  location: Location = window.location,
) {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const pending = getPendingSpotifyAuth();

  if (!code || !state || !pending) {
    return { handled: false as const, errorMessage: undefined };
  }

  if (state !== pending.state) {
    clearPendingSpotifyAuth();
    return {
      handled: true as const,
      errorMessage: 'Spotify 로그인 상태 검증에 실패했어요. 다시 시도해주세요.',
    };
  }

  try {
    const clientId = await getSpotifyClientId();
    const token = await exchangeToken(
      new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.codeVerifier,
      }),
    );

    const accessToken = token.access_token;
    if (!accessToken) {
      throw new Error('Spotify 액세스 토큰이 비어 있어요. 다시 시도해주세요.');
    }

    const spotifyUser = await fetchSpotifyProfile(accessToken);
    const user = await attachSupabaseUser(spotifyUser);
    const session: StoredSpotifyDirectSession = {
      accessToken,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      user,
    };
    setStoredSession(session);
    clearPendingSpotifyAuth();

    return {
      handled: true as const,
      errorMessage: undefined,
      auth: buildDirectAuthSnapshot(session),
      user,
    };
  } catch (error) {
    clearSpotifyDirectSession();
    return {
      handled: true as const,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'Spotify 로그인 세션을 완료하지 못했어요. 다시 시도해주세요.',
    };
  }
}
