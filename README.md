# Playlist Ladder

A React + TypeScript + Vite web app for ranking Spotify playlist tracks by preference using a bucket-seeded Elo system, with Supabase auth/data scaffolding and Tailwind CSS UI.

## Features

- Direct Spotify Authorization Code with PKCE login, token refresh, playlist/saved-track loading, and Premium-aware playback support.
- English/Korean UI toggle with persisted locale selection.
- Playlist import flow with a demo mode when environment variables are not present.
- Tier bucket setup that seeds ratings using the requested tier anchors.
- Closest-rated same-tier matchmaking with adaptive K-factor updates.
- Adaptive battle UI:
  - rating gap `>= 150` → binary win/lose
  - rating gap `< 150` → 5-point scale
- Ranking board with convergence, search, and tier filtering.
- Supabase SQL schema for `sorter_state`, `songs`, `ratings`, and `matches` with RLS keyed by `user_id`.

## Local development

```bash
npm install
npm run dev
```

The Vite dev server is configured to run on `http://localhost:3000` so it matches the local Spotify/Supabase callback flow.

Create a `.env` from `.env.example`. `VITE_SPOTIFY_CLIENT_ID` is required for Spotify login, and `VITE_SPOTIFY_REDIRECT_TO` should be the exact app origin whose `/auth/callback` is registered in the Spotify Developer Dashboard. Supabase is now optional and is only used for anonymous app-state sync; Spotify authentication itself is handled directly with Authorization Code + PKCE. After Spotify approval, the app returns authenticated users to `/`, where they select a playlist and then continue to `/bucket`.

## Spotify + optional Supabase setup notes

1. In Spotify Developer Dashboard, register your app callback URL exactly as `https://<your-origin>/auth/callback` (or your local `http://127.0.0.1:3000/auth/callback`).
2. Put the Spotify app Client ID in `VITE_SPOTIFY_CLIENT_ID`.
3. Set `VITE_SPOTIFY_REDIRECT_TO` to the site origin only; the app appends `/auth/callback`.
4. The app requests these scopes because they are needed for the required features:
   - `user-read-private`
   - `user-read-email`
   - `playlist-read-private`
   - `playlist-read-collaborative`
   - `user-library-read`
   - `user-read-playback-state`
   - `user-modify-playback-state`
   - `streaming`
5. Supabase is optional. If you want cloud sync, enable anonymous auth and run `supabase/schema.sql` against your project to create the RLS-protected tables.


## Spotify login troubleshooting

If Spotify login fails in the PKCE callback, work through the matrix below.

### A. Callback / redirect mismatch

1. Spotify Developer Dashboard Redirect URI must exactly match the app callback URL: `https://<your-app-origin>/auth/callback`.
2. `VITE_SPOTIFY_REDIRECT_TO` must match that same origin, without an extra path.
3. If you use preview deployments or multiple domains, every actual callback origin must be registered separately in Spotify.
4. For local development, prefer `http://127.0.0.1:3000/auth/callback` rather than `localhost`, because Spotify's post-2025 OAuth migration tightened redirect handling.

### B. Client ID / PKCE state

1. Confirm `VITE_SPOTIFY_CLIENT_ID` matches the current Spotify app.
2. If you recently switched apps or redirect URIs, fully clear site storage and restart login so a stale PKCE `state` or `code_verifier` is not reused.
3. If Spotify returns a code but the token exchange fails, the callback URL, client ID, or stored PKCE verifier is usually mismatched.
4. Re-save Redirect URIs in Spotify if you edited them recently.

### C. Spotify Development Mode restrictions

1. In **Spotify Developer Dashboard → User Management**, add the exact Spotify account email for every tester who logs in.
2. If the login works for the owner account but fails for a tester, this is the first thing to verify.
3. Spotify can issue an OAuth response but still fail later when Supabase tries to fetch `/v1/me`, which then surfaces as this provider-profile error.
4. Existing Development Mode apps also require the app owner to maintain **Spotify Premium** under Spotify's 2026 platform policy change that took effect on **March 9, 2026**.

### D. Flow selection in this repository

1. This app now always uses **direct Spotify PKCE** for Spotify login.
2. Supabase is no longer in the OAuth hop; it is only used after login for optional anonymous state sync.
3. Because of that, the only Spotify callback that matters is your app's own `/auth/callback` URL.

### E. Browser / session edge cases

1. Close any stale `/auth/callback` tab and restart login from the home page. Reopening a previously used callback URL can replay an already-consumed auth code and keep showing the same error page.
2. If you changed redirect settings while testing, fully sign out, clear site storage/cookies for the app and Supabase domain, then start a fresh login.
3. Avoid using the browser back button into a completed OAuth redirect; start a new auth round-trip instead.

### F. Environment-variable checks for this app

1. `VITE_SPOTIFY_CLIENT_ID` must point to the correct Spotify app.
2. `VITE_SPOTIFY_REDIRECT_TO` must be the exact site origin for the current deployment, without an extra path.
3. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are only needed when you want synced state storage.
4. If Supabase anonymous auth is disabled, the app still works but state sync is local-only for the session.

### G. Practical fix order

1. Verify the deployed origin and the Spotify Redirect URI match exactly.
2. Verify `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_TO`.
3. Clear stale callback tabs and local storage, then begin a brand-new login attempt.
4. Add the tester account to Spotify User Management.
5. Confirm the app owner still has Spotify Premium if you need Web Playback SDK full-track playback.

## Architecture overview

- `src/lib/spotify.ts` fetches Spotify profile, playlists, tracks, and lazy-loads the Web Playback SDK.
- `src/lib/elo.ts` contains rating initialization, K-factor logic, matchmaking, and convergence helpers.
- `src/store/appStore.ts` stores UI state in Zustand and syncs changes to Supabase instead of browser localStorage.
- `src/pages/*` implements the auth callback, landing/import flow, bucket setup, match loop, and ranking views.

## Reconnection verification checklist

After a tab refresh restores a previously synced `spotify_provider_token`, verify the shared `useSpotifyPlayer` hook resets cleanly in both premium playback screens:

- `BucketSetupPage`: immediately after reconnect, `ready` should return to `false` during SDK setup, then flip to `true` once the player is ready, and any stale `error` message from the previous session should clear.
- `MatchPage`: immediately after reconnect, `ready` should follow the same reset/reconnect cycle and `error` should stay `null` unless the new connection actually fails.
- If no token is restored, both pages should show the missing-token error without reusing a stale `ready`, `deviceId`, or `currentTrackId` state.
