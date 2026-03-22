# Playlist Ladder

A React + TypeScript + Vite web app for ranking Spotify playlist tracks by preference using a bucket-seeded Elo system, with Supabase auth/data scaffolding and Tailwind CSS UI.

## Features

- Spotify OAuth via Supabase Auth with the requested scopes and an overrideable preview-safe redirect URL.
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

Create a `.env` from `.env.example` and provide your Supabase project URL and anon key. `VITE_SUPABASE_REDIRECT_TO` should be the site origin for your deployment; the app automatically sends Spotify OAuth back through `/auth/callback` and exchanges the returned auth code in the callback page. For preview deployments, add the resulting app callback URL to the Supabase redirect allow list only. After Spotify approval, the app returns authenticated users to `/`, where they select a playlist and then continue to `/bucket`.

## Supabase + Spotify setup notes

1. In Supabase Auth, enable the Spotify provider.
2. Add the callback URLs in the correct places. For local development, add `http://localhost:3000/auth/callback` to Supabase Auth redirect URLs and set `VITE_SUPABASE_REDIRECT_TO=http://localhost:3000` so the app can derive that callback path. In the Spotify Developer Dashboard, the Redirect URI must be your Supabase project callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`), not your app's `/auth/callback` URL.
3. Use the following scopes:
   - `user-read-private`
   - `user-read-email`
   - `playlist-read-private`
   - `user-library-read`
   - `streaming`
   - `user-modify-playback-state`
4. Run `supabase/schema.sql` against your project to create the RLS-protected tables.


## Spotify login troubleshooting

If Spotify shows `Error getting user profile from external provider` even though the redirect URLs look correct:

1. Open **Spotify Developer Dashboard → User Management** and add the exact Spotify account email that is trying to log in. Development mode apps can still issue OAuth tokens for non-allowlisted users, but Spotify documents that API requests for those users can fail with `403`, which Supabase surfaces as a provider-profile error.
2. Check whether the Spotify app owner still has **Spotify Premium**. Spotify's February 6, 2026 platform update says this became required for existing Development Mode apps starting **March 9, 2026**.
3. Re-copy the current Spotify **Client ID** and **Client Secret** into **Supabase → Authentication → Providers → Spotify** and save again.
4. Verify that the Supabase callback URL is still listed in Spotify Redirect URIs, and that your app's `/auth/callback` URL is still listed in Supabase Redirect URLs.

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
