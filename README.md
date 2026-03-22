# Playlist Ladder

A React + TypeScript + Vite web app for ranking Spotify playlist tracks by preference using a bucket-seeded Elo system, with Supabase auth/data scaffolding and Tailwind CSS UI.

## Features

- Spotify OAuth via Supabase Auth with the requested scopes and an overrideable preview-safe redirect URL, plus optional direct Spotify PKCE login when explicitly enabled.
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

Create a `.env` from `.env.example` and provide your Supabase project URL and anon key. `VITE_SUPABASE_REDIRECT_TO` should be the site origin for your deployment; the app automatically sends Spotify OAuth back through `/auth/callback` and exchanges the returned auth code in the callback page. By default, the app signs in through Supabase Social Login, so preview deployments only need that app callback URL added to the Supabase redirect allow list. If you explicitly enable direct Spotify PKCE with `VITE_SPOTIFY_DIRECT_AUTH=true`, you must also register that same app `/auth/callback` URL in the Spotify Developer Dashboard. After Spotify approval, the app returns authenticated users to `/`, where they select a playlist and then continue to `/bucket`.

## Supabase + Spotify setup notes

1. In Supabase Auth, enable the Spotify provider.
2. Add the callback URLs in the correct places. For local development, add `http://localhost:3000/auth/callback` to Supabase Auth redirect URLs and set `VITE_SUPABASE_REDIRECT_TO=http://localhost:3000` so the app can derive that callback path. For the default login flow, the Spotify Developer Dashboard Redirect URI must stay on your Supabase project callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`), not your app's `/auth/callback` URL. Only add the app `/auth/callback` URL to Spotify when you intentionally enable direct Spotify PKCE with `VITE_SPOTIFY_DIRECT_AUTH=true`.
3. Use the following scopes:
   - `user-read-private`
   - `user-read-email`
   - `playlist-read-private`
   - `user-library-read`
   - `streaming`
   - `user-modify-playback-state`
4. Run `supabase/schema.sql` against your project to create the RLS-protected tables.


## Spotify login troubleshooting

If Spotify shows `Error getting user profile from external provider`, work through the full matrix below.

### A. Callback / redirect mismatch

1. **Default Supabase Social Login flow**: keep the Spotify Developer Dashboard Redirect URI pointed at your Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`). Do **not** replace it with your app's `/auth/callback` URL in the default flow.
2. **Supabase Redirect Allow List**: add the exact app callback URL (`https://<your-app-origin>/auth/callback`) to **Supabase Auth → URL Configuration → Redirect URLs**. If you use multiple origins, register each one separately:
   - local: `http://localhost:3000/auth/callback`
   - production: `https://studious-octo-giggle-dun.vercel.app/auth/callback`
   - every preview / custom domain you actually use
3. **Preview deployment mismatch**: if Vercel preview URLs are used, set `VITE_SUPABASE_REDIRECT_TO` to that preview origin for the deployment; otherwise Supabase can send the user back to a different origin than the one that initiated login.
4. **Direct Spotify PKCE flow**: only when `VITE_SPOTIFY_DIRECT_AUTH=true` is intentionally enabled should you also add the app's `/auth/callback` URL to Spotify Redirect URIs.

### B. Provider credentials / provider state

1. In **Supabase → Authentication → Providers → Spotify**, confirm Spotify is still enabled.
2. Re-copy the latest Spotify **Client ID** and **Client Secret** from the Spotify Developer Dashboard into Supabase and click **Save** again.
3. If the Spotify app was regenerated, transferred, or its secret was rotated, Supabase can keep an old secret and fail during the profile fetch step.
4. If the app settings were recently edited, re-save Redirect URIs in Spotify as well so the latest value is persisted.

### C. Spotify Development Mode restrictions

1. In **Spotify Developer Dashboard → User Management**, add the exact Spotify account email for every tester who logs in.
2. If the login works for the owner account but fails for a tester, this is the first thing to verify.
3. Spotify can issue an OAuth response but still fail later when Supabase tries to fetch `/v1/me`, which then surfaces as this provider-profile error.
4. Existing Development Mode apps also require the app owner to maintain **Spotify Premium** under Spotify's 2026 platform policy change that took effect on **March 9, 2026**.

### D. Flow-selection mismatch in this repository

1. This app defaults to **Supabase Social Login**.
2. It switches to **direct Spotify PKCE** only when `VITE_SPOTIFY_DIRECT_AUTH=true` **and** the app can confirm the exact app `/auth/callback` URL is registered in Spotify.
3. If you expected direct Spotify login but did not enable that flag in the Vercel environment, the deployed app will still use Supabase Social Login rules.
4. If you enabled the flag but forgot to register the app callback in Spotify, login can still fall back or fail depending on the environment and cached config.

### E. Browser / session edge cases

1. Close any stale `/auth/callback` tab and restart login from the home page. Reopening a previously used callback URL can replay an already-consumed auth code and keep showing the same error page.
2. If you changed redirect settings while testing, fully sign out, clear site storage/cookies for the app and Supabase domain, then start a fresh login.
3. Avoid using the browser back button into a completed OAuth redirect; start a new auth round-trip instead.

### F. Environment-variable checks for this app

1. `VITE_SUPABASE_URL` must point to the correct Supabase project.
2. `VITE_SUPABASE_ANON_KEY` must match that same project.
3. `VITE_SUPABASE_REDIRECT_TO` should be the exact site origin for the current deployment, without an extra path; the app appends `/auth/callback` itself.
4. `VITE_SPOTIFY_DIRECT_AUTH` should only be `true` when you intentionally want the direct Spotify PKCE flow and have already added the app callback URL to Spotify Redirect URIs.

### G. Practical fix order

1. Verify whether the failing deployment is using the **default Supabase flow** or **direct Spotify PKCE**.
2. For the default flow, keep Spotify Redirect URI = **Supabase callback URL**, and Supabase Redirect URL = **app `/auth/callback` URL**.
3. Re-save Spotify Client ID/Secret in Supabase.
4. Add the tester account to Spotify User Management.
5. Confirm the app owner still has Spotify Premium.
6. Clear stale callback tabs/session state and retry with a brand-new login attempt.

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
