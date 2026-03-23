import type { AuthSnapshot, SpotifyProduct, UserProfile } from '../types';

const SPOTIFY_ACCOUNTS_ROOT = 'https://accounts.spotify.com';
const SPOTIFY_API_ROOT = 'https://api.spotify.com/v1';
const SPOTIFY_CALLBACK_PATH = '/auth/callback';
const SPOTIFY_AUTH_SESSION_STORAGE_KEY = 'spotify_auth_session';
const SPOTIFY_PKCE_STORAGE_KEY = 'spotify_pkce_pending';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

const SPOTIFY_REQUIRED_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
] as const;

interface PendingPkceState {
  codeVerifier: string;
  state: string;
  redirectUri: string;
  createdAt: number;
}

export interface SpotifyAuthSession {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
}

interface SpotifyTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface SpotifyMeResponse {
  id: string;
  email?: string;
  display_name?: string | null;
  product?: SpotifyProduct;
  images?: Array<{ url?: string | null }> | null;
}

export const spotifyScopeString = SPOTIFY_REQUIRED_SCOPES.join(' ');
export const hasSpotifyClientId = Boolean(import.meta.env.VITE_SPOTIFY_CLIENT_ID);

function isBrowser() {
  return typeof window !== 'undefined';
}

function readStorage<T>(key: string): T | undefined {
  if (!isBrowser()) return undefined;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value?: unknown) {
  if (!isBrowser()) return;

  if (value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function getSpotifyClientId() {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID가 설정되지 않았어요. Spotify 직접 로그인을 사용할 수 없어요.');
  }
  return clientId;
}

function getBaseRedirectUrl() {
  if (import.meta.env.VITE_SPOTIFY_REDIRECT_TO) {
    return import.meta.env.VITE_SPOTIFY_REDIRECT_TO;
  }

  if (isBrowser()) {
    return window.location.origin;
  }

  return 'http://127.0.0.1:3000';
}

export function getSpotifyRedirectUrl() {
  const url = new URL(getBaseRedirectUrl());
  url.pathname = SPOTIFY_CALLBACK_PATH;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function readAuthCallbackParam(location: Location, key: string) {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  return searchParams.get(key) ?? hashParams.get(key) ?? undefined;
}

export function getAuthCallbackErrorMessage(location: Location = window.location) {
  const rawError = readAuthCallbackParam(location, 'error_description') ?? readAuthCallbackParam(location, 'error');
  return rawError ? decodeURIComponent(rawError.replace(/\+/g, ' ')) : undefined;
}

export function getAuthCallbackErrorCode(location: Location = window.location) {
  return readAuthCallbackParam(location, 'error');
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return toBase64Url(bytes).slice(0, length);
}

async function sha256(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(digest);
}

async function createCodeChallenge(verifier: string) {
  return toBase64Url(await sha256(verifier));
}

function getPendingPkceState() {
  return readStorage<PendingPkceState>(SPOTIFY_PKCE_STORAGE_KEY);
}

function savePendingPkceState(state: PendingPkceState) {
  writeStorage(SPOTIFY_PKCE_STORAGE_KEY, state);
}

function clearPendingPkceState() {
  writeStorage(SPOTIFY_PKCE_STORAGE_KEY, undefined);
}

export function loadSpotifySession() {
  return readStorage<SpotifyAuthSession>(SPOTIFY_AUTH_SESSION_STORAGE_KEY);
}

export function saveSpotifySession(session: SpotifyAuthSession) {
  writeStorage(SPOTIFY_AUTH_SESSION_STORAGE_KEY, session);
  return session;
}

export function clearSpotifySession() {
  clearPendingPkceState();
  writeStorage(SPOTIFY_AUTH_SESSION_STORAGE_KEY, undefined);
}

function buildAuthSnapshot(session: SpotifyAuthSession, syncUserId?: string): AuthSnapshot {
  return {
    provider: 'spotify',
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    syncUserId,
  };
}

function isSessionExpiringSoon(session: SpotifyAuthSession) {
  return Date.now() >= session.expiresAt - TOKEN_REFRESH_BUFFER_MS;
}

async function exchangeToken(body: URLSearchParams) {
  const response = await fetch(`${SPOTIFY_ACCOUNTS_ROOT}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json() as SpotifyTokenResponse;
  if (!response.ok || !data.access_token || !data.token_type || !data.expires_in) {
    throw new Error(data.error_description ?? data.error ?? `Spotify 토큰 요청 실패 (${response.status})`);
  }

  return saveSpotifySession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? loadSpotifySession()?.refreshToken,
    tokenType: data.token_type,
    scope: data.scope ?? spotifyScopeString,
    expiresAt: Date.now() + (data.expires_in * 1000),
  });
}

export async function signInWithSpotify() {
  const clientId = getSpotifyClientId();
  const redirectUri = getSpotifyRedirectUrl();
  const state = randomString(32);
  const codeVerifier = randomString(96);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  savePendingPkceState({
    codeVerifier,
    state,
    redirectUri,
    createdAt: Date.now(),
  });

  const authUrl = new URL(`${SPOTIFY_ACCOUNTS_ROOT}/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('scope', spotifyScopeString);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('show_dialog', 'true');

  window.location.assign(authUrl.toString());
}

export async function exchangeCodeForSpotifySession(location: Location = window.location) {
  const callbackError = getAuthCallbackErrorMessage(location);
  if (callbackError) {
    return { errorMessage: callbackError };
  }

  const code = new URLSearchParams(location.search).get('code');
  const callbackState = new URLSearchParams(location.search).get('state');
  const pending = getPendingPkceState();

  if (!code) {
    return { errorMessage: '인증 코드가 없어 Spotify 세션을 만들지 못했어요.' };
  }

  if (!pending) {
    return { errorMessage: 'PKCE 로그인 상태가 없어 Spotify 세션을 교환하지 못했어요. 로그인부터 다시 시작해주세요.' };
  }

  if (!callbackState || callbackState !== pending.state) {
    clearPendingPkceState();
    return { errorMessage: 'Spotify 로그인 state 검증에 실패했어요. 보안을 위해 다시 로그인해주세요.' };
  }

  try {
    const session = await exchangeToken(new URLSearchParams({
      client_id: getSpotifyClientId(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier,
    }));
    clearPendingPkceState();
    return { session };
  } catch (error) {
    clearPendingPkceState();
    return {
      errorMessage: error instanceof Error
        ? error.message
        : 'Spotify 인증 코드를 세션으로 교환하지 못했어요.',
    };
  }
}

export async function refreshSpotifySession(force = false) {
  const current = loadSpotifySession();
  if (!current?.refreshToken) {
    if (force) clearSpotifySession();
    return undefined;
  }

  if (!force && !isSessionExpiringSoon(current)) {
    return current;
  }

  try {
    return await exchangeToken(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: getSpotifyClientId(),
    }));
  } catch (error) {
    clearSpotifySession();
    throw error;
  }
}

export async function getValidSpotifySession() {
  const current = loadSpotifySession();
  if (!current) return undefined;

  if (!isSessionExpiringSoon(current)) {
    return current;
  }

  return refreshSpotifySession(true);
}

export async function getValidSpotifyAccessToken(preferredToken?: string) {
  const current = await getValidSpotifySession().catch(() => undefined);
  return current?.accessToken ?? preferredToken;
}

export async function fetchSpotifyProfile(accessToken: string) {
  const response = await fetch(`${SPOTIFY_API_ROOT}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify 프로필 요청 실패 (${response.status})`);
  }

  return response.json() as Promise<SpotifyMeResponse>;
}

export async function buildUserProfile(syncUserId?: string): Promise<{ auth: AuthSnapshot; user: UserProfile } | undefined> {
  const session = await getValidSpotifySession();
  if (!session?.accessToken) return undefined;

  const profile = await fetchSpotifyProfile(session.accessToken);
  const product = profile.product ?? 'unknown';
  const spotifyUserId = profile.id;

  return {
    auth: buildAuthSnapshot(session, syncUserId),
    user: {
      id: syncUserId ?? spotifyUserId,
      spotifyUserId,
      email: profile.email,
      displayName: profile.display_name ?? undefined,
      imageUrl: profile.images?.[0]?.url ?? undefined,
      spotifyProduct: product,
      isPremium: product === 'premium',
    },
  };
}

export function getSpotifyTrackOpenUrl(trackId: string) {
  return `https://open.spotify.com/track/${trackId}`;
}

export async function signOut() {
  clearSpotifySession();
}
