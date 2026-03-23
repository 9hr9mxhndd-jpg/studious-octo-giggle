import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type {
  PlaylistSummary,
  Song,
  MatchRecord,
  RatingRecord,
  AppLocale,
  SongId,
} from "../types";
import type { ActiveSource } from "../store/appStore";

interface RemoteStateRow {
  user_id: string;
  locale: AppLocale | null;
  playlists: PlaylistSummary[] | null;
  selected_playlist_id: string | null;
  active_source: ActiveSource | null;
  liked_songs_import: {
    totalCount: number;
    nextOffset: number;
    hasMore: boolean;
  } | null;
  last_matched_at: Record<string, number> | null;
  spotify_provider_token: string | null;
}

interface SongRow {
  id: string;
  user_id: string;
  spotify_track_id: string;
  playlist_id: string;
  title: string;
  artist: string;
  album: string | null;
  image_url: string | null;
  preview_url: string | null;
  duration_ms: number | null;
  tier: number | null;
  uncertain: boolean;
}

interface RatingRow {
  song_id: string;
  rating: number;
  matches_played: number;
  last_delta: number;
}

interface MatchRow {
  id: string;
  left_song_id: string;
  right_song_id: string;
  outcome: number;
  rating_gap: number;
  created_at: string;
}

export interface RemoteAppState {
  locale: AppLocale;
  playlists: PlaylistSummary[];
  selectedPlaylistId?: string;
  activeSource?: ActiveSource;
  likedSongsImport?: {
    totalCount: number;
    nextOffset: number;
    hasMore: boolean;
  };
  lastMatchedAt: Record<string, number>;
  songs: Song[];
  ratings: Record<SongId, RatingRecord>;
  matches: MatchRecord[];
  spotifyProviderToken?: string;
}

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  pageLoader: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await pageLoader(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }

    from += SUPABASE_PAGE_SIZE;
  }
}

function getSourceTrackCount(sourceId: string | undefined, songs: Song[]) {
  if (!sourceId) return 0;
  return songs.filter((song) => song.playlistId === sourceId).length;
}

function syncActiveSourceTrackCount(
  activeSource: ActiveSource | undefined,
  songs: Song[],
) {
  if (!activeSource) return activeSource;

  const syncedTrackCount = getSourceTrackCount(activeSource.id, songs);
  if (syncedTrackCount === activeSource.trackCount) return activeSource;

  return {
    ...activeSource,
    trackCount: syncedTrackCount,
  };
}

function buildLastMatchedAt(matches: MatchRecord[]) {
  return matches.reduce<Record<string, number>>((acc, match, index) => {
    const pairKey = [match.leftSongId, match.rightSongId].sort().join("|");
    acc[pairKey] = matches.length - index - 1;
    return acc;
  }, {});
}

function mapSongRow(row: SongRow): Song {
  return {
    id: row.id,
    spotifyTrackId: row.spotify_track_id,
    playlistId: row.playlist_id,
    title: row.title,
    artist: row.artist,
    album: row.album ?? "",
    imageUrl: row.image_url ?? "",
    previewUrl: row.preview_url ?? undefined,
    durationMs: row.duration_ms ?? 0,
    tier: row.tier === null ? undefined : (row.tier as 1 | 2 | 3),
    uncertain: row.uncertain,
  };
}

function mapSong(song: Song, userId: string): SongRow {
  return {
    id: song.id,
    user_id: userId,
    spotify_track_id: song.spotifyTrackId,
    playlist_id: song.playlistId,
    title: song.title,
    artist: song.artist,
    album: song.album,
    image_url: song.imageUrl,
    preview_url: song.previewUrl ?? null,
    duration_ms: song.durationMs,
    tier: song.tier ?? null,
    uncertain: song.uncertain,
  };
}

function mapRating(songId: SongId, rating: RatingRecord, userId: string) {
  return {
    user_id: userId,
    song_id: songId,
    rating: rating.rating,
    matches_played: rating.matchesPlayed,
    last_delta: rating.lastDelta,
  };
}

function mapMatch(match: MatchRecord, userId: string) {
  return {
    id: match.id,
    user_id: userId,
    left_song_id: match.leftSongId,
    right_song_id: match.rightSongId,
    outcome: match.outcome,
    rating_gap: match.ratingGap,
    created_at: match.createdAt,
  };
}

export async function loadUserAppState(
  userId: string,
): Promise<RemoteAppState> {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  const client = supabase;

  const [stateResult, songRows, ratingRows, matchRows] = await Promise.all([
    client
      .from("sorter_state")
      .select(
        "locale, playlists, selected_playlist_id, active_source, liked_songs_import, last_matched_at, spotify_provider_token",
      )
      .eq("user_id", userId)
      .maybeSingle<RemoteStateRow>(),
    fetchAllRows<SongRow>(async (from, to) =>
      await client
        .from("songs")
        .select(
          "id, user_id, spotify_track_id, playlist_id, title, artist, album, image_url, preview_url, duration_ms, tier, uncertain",
        )
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<RatingRow>(async (from, to) =>
      await client
        .from("ratings")
        .select("song_id, rating, matches_played, last_delta")
        .eq("user_id", userId)
        .order("song_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<MatchRow>(async (from, to) =>
      await client
        .from("matches")
        .select(
          "id, left_song_id, right_song_id, outcome, rating_gap, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
  ]);

  if (stateResult.error) throw stateResult.error;

  const songs = songRows.map((row) => mapSongRow(row));
  const ratings = Object.fromEntries(
    ratingRows.map((row) => {
      const typed = row;
      return [
        typed.song_id,
        {
          songId: typed.song_id,
          rating: typed.rating,
          matchesPlayed: typed.matches_played,
          lastDelta: typed.last_delta,
        } satisfies RatingRecord,
      ];
    }),
  );
  const matches = matchRows.map((row) => {
    const typed = row;
    return {
      id: typed.id,
      leftSongId: typed.left_song_id,
      rightSongId: typed.right_song_id,
      outcome: typed.outcome,
      ratingGap: typed.rating_gap,
      createdAt: typed.created_at,
    } satisfies MatchRecord;
  });
  const state = stateResult.data;
  const derivedLastMatchedAt = buildLastMatchedAt(matches);

  return {
    locale: state?.locale ?? "ko",
    playlists: state?.playlists ?? [],
    selectedPlaylistId: state?.selected_playlist_id ?? undefined,
    activeSource: syncActiveSourceTrackCount(
      state?.active_source ?? undefined,
      songs,
    ),
    likedSongsImport: state?.liked_songs_import ?? undefined,
    lastMatchedAt:
      Object.keys(derivedLastMatchedAt).length > 0
        ? derivedLastMatchedAt
        : state?.last_matched_at ?? {},
    songs,
    ratings,
    matches,
    spotifyProviderToken: state?.spotify_provider_token ?? undefined,
  };
}

export async function saveSessionState(
  userId: string,
  payload: Partial<
    Pick<
      RemoteAppState,
      | "locale"
      | "playlists"
      | "selectedPlaylistId"
      | "activeSource"
      | "likedSongsImport"
      | "lastMatchedAt"
    >
  > & { spotifyProviderToken?: string },
) {
  if (!supabase) return;
  const { error } = await supabase.from("sorter_state").upsert(
    {
      user_id: userId,
      locale: payload.locale,
      playlists: payload.playlists,
      selected_playlist_id: payload.selectedPlaylistId ?? null,
      active_source: payload.activeSource ?? null,
      liked_songs_import: payload.likedSongsImport ?? null,
      last_matched_at: payload.lastMatchedAt,
      spotify_provider_token: payload.spotifyProviderToken,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function saveSpotifyProviderToken(userId: string, token?: string) {
  if (!supabase) return;
  const { error } = await supabase.from("sorter_state").upsert(
    {
      user_id: userId,
      spotify_provider_token: token ?? null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function replaceLibrary(
  userId: string,
  songs: Song[],
  ratings: Record<SongId, RatingRecord>,
  matches: MatchRecord[] = [],
) {
  if (!supabase) return;
  const deleteMatches = supabase.from("matches").delete().eq("user_id", userId);
  const deleteRatings = supabase.from("ratings").delete().eq("user_id", userId);
  const deleteSongs = supabase.from("songs").delete().eq("user_id", userId);
  const [
    { error: matchDeleteError },
    { error: ratingDeleteError },
    { error: songDeleteError },
  ] = await Promise.all([deleteMatches, deleteRatings, deleteSongs]);
  if (matchDeleteError) throw matchDeleteError;
  if (ratingDeleteError) throw ratingDeleteError;
  if (songDeleteError) throw songDeleteError;

  if (songs.length === 0) return;

  const { error: songInsertError } = await supabase
    .from("songs")
    .insert(songs.map((song) => mapSong(song, userId)));
  if (songInsertError) throw songInsertError;

  const ratingRows = songs
    .map((song) => ratings[song.id])
    .filter((rating): rating is RatingRecord => Boolean(rating))
    .map((rating) => mapRating(rating.songId, rating, userId));

  if (ratingRows.length > 0) {
    const { error: ratingInsertError } = await supabase
      .from("ratings")
      .insert(ratingRows);
    if (ratingInsertError) throw ratingInsertError;
  }

  if (matches.length > 0) {
    const { error: matchInsertError } = await supabase
      .from("matches")
      .insert(matches.map((match) => mapMatch(match, userId)));
    if (matchInsertError) throw matchInsertError;
  }
}

export async function appendLibrary(
  userId: string,
  songs: Song[],
  ratings: Record<SongId, RatingRecord>,
) {
  if (!supabase || songs.length === 0) return;
  const { error: songError } = await supabase
    .from("songs")
    .upsert(songs.map((song) => mapSong(song, userId)));
  if (songError) throw songError;

  const ratingRows = songs
    .map((song) => ratings[song.id])
    .filter((rating): rating is RatingRecord => Boolean(rating))
    .map((rating) => mapRating(rating.songId, rating, userId));
  if (ratingRows.length > 0) {
    const { error: ratingError } = await supabase
      .from("ratings")
      .upsert(ratingRows, { onConflict: "user_id,song_id" });
    if (ratingError) throw ratingError;
  }
}

export async function saveSongAndRating(
  userId: string,
  song: Song,
  rating?: RatingRecord,
) {
  if (!supabase) return;
  const { error: songError } = await supabase
    .from("songs")
    .upsert(mapSong(song, userId));
  if (songError) throw songError;
  if (rating) {
    const { error: ratingError } = await supabase
      .from("ratings")
      .upsert(mapRating(song.id, rating, userId), {
        onConflict: "user_id,song_id",
      });
    if (ratingError) throw ratingError;
  }
}

export async function insertMatch(
  userId: string,
  match: MatchRecord,
  ratings: RatingRecord[],
  lastMatchedAt: Record<string, number>,
) {
  if (!supabase) return;
  const { error: matchError } = await supabase
    .from("matches")
    .insert(mapMatch(match, userId));
  if (matchError) throw matchError;

  if (ratings.length > 0) {
    const { error: ratingError } = await supabase.from("ratings").upsert(
      ratings.map((rating) => mapRating(rating.songId, rating, userId)),
      { onConflict: "user_id,song_id" },
    );
    if (ratingError) throw ratingError;
  }

  await saveSessionState(userId, { lastMatchedAt });
}

export async function clearUserAppState(userId: string) {
  if (!supabase) return;
  const [
    { error: matchError },
    { error: ratingError },
    { error: songError },
    { error: stateError },
  ] = await Promise.all([
    supabase.from("matches").delete().eq("user_id", userId),
    supabase.from("ratings").delete().eq("user_id", userId),
    supabase.from("songs").delete().eq("user_id", userId),
    supabase.from("sorter_state").upsert(
      {
        user_id: userId,
        playlists: [],
        selected_playlist_id: null,
        active_source: null,
        liked_songs_import: null,
        last_matched_at: {},
      },
      { onConflict: "user_id" },
    ),
  ]);

  if (matchError) throw matchError;
  if (ratingError) throw ratingError;
  if (songError) throw songError;
  if (stateError) throw stateError;
}

export function subscribeToUserAppState(userId: string, onChange: () => void) {
  if (!supabase) return () => undefined;

  const client = supabase;
  if (!client) return () => undefined;

  const channel: RealtimeChannel = client
    .channel(`sorter-sync:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sorter_state",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "songs",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ratings",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "matches",
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
