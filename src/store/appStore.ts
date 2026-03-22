import { create } from "zustand";
import {
  buildMatchup,
  getInitialRatingForTier,
  resolveMatchResult,
} from "../lib/elo";
import { buildSongNaturalKey } from "../lib/songIdentity";
import {
  appendLibrary,
  clearUserAppState,
  insertMatch,
  replaceLibrary,
  saveSessionState,
  saveSongAndRating,
  type RemoteAppState,
} from "../lib/appSync";
import type {
  AppLocale,
  AuthSnapshot,
  MatchRecord,
  PlaylistSummary,
  RatingRecord,
  Song,
  SongId,
  Tier,
  UserProfile,
} from "../types";

export interface ActiveSource {
  id: string;
  name: string;
  // 앱에 실제로 임포트되어 현재 처리 가능한 곡 수입니다.
  trackCount: number;
  imageUrl?: string;
  isLikedSongs?: boolean;
}

interface LikedSongsImportState {
  totalCount: number;
  nextOffset: number;
  hasMore: boolean;
}

interface AppState {
  auth?: AuthSnapshot;
  user?: UserProfile;
  locale: AppLocale;
  playlists: PlaylistSummary[];
  songs: Song[];
  likedSongsImport?: LikedSongsImportState;
  ratings: Record<SongId, RatingRecord>;
  matches: MatchRecord[];
  selectedPlaylistId?: string;
  activeSource?: ActiveSource;
  lastMatchedAt: Record<string, number>;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  setAuth: (auth?: AuthSnapshot) => void;
  setUser: (user?: UserProfile) => void;
  setLocale: (locale: AppLocale) => void;
  setPlaylists: (playlists: PlaylistSummary[]) => void;
  selectPlaylist: (playlistId: string) => void;
  setLikedSongsImport: (likedSongsImport?: LikedSongsImportState) => void;
  setActiveSource: (source?: ActiveSource) => void;
  // 새 플레이리스트를 선택해 라이브러리를 통째로 교체할 때만 사용합니다.
  importSongs: (songs: Song[]) => void;
  appendSongs: (songs: Song[]) => void;
  assignTier: (songId: SongId, tier: Tier, uncertain: boolean) => void;
  submitMatch: (leftScore: number) => void;
  resetFlow: () => void;
  replaceRemoteState: (state: RemoteAppState) => void;
  clearSyncedState: () => void;
}

function getDefaultRating(songId: SongId): RatingRecord {
  return {
    songId,
    rating: 1500,
    matchesPlayed: 0,
    lastDelta: 0,
  };
}

function buildRatings(
  songs: Song[],
  existingRatings: Record<SongId, RatingRecord> = {},
) {
  return songs.reduce<Record<SongId, RatingRecord>>((acc, song) => {
    acc[song.id] = existingRatings[song.id] ?? getDefaultRating(song.id);
    return acc;
  }, {});
}

function mergeSongsWithExistingState(nextSongs: Song[], existingSongs: Song[]) {
  const existingById = new Map(existingSongs.map((song) => [song.id, song]));
  const existingByNaturalKey = new Map(
    existingSongs.map((song) => [buildSongNaturalKey(song), song]),
  );

  return nextSongs.map((song) => {
    const existingSong =
      existingById.get(song.id) ??
      existingByNaturalKey.get(buildSongNaturalKey(song));

    if (!existingSong) return song;

    return {
      ...song,
      tier: existingSong.tier,
      uncertain: existingSong.uncertain,
    };
  });
}

function buildSongIdRemap(nextSongs: Song[], existingSongs: Song[]) {
  const nextSongIdByNaturalKey = new Map(
    nextSongs.map((song) => [buildSongNaturalKey(song), song.id]),
  );

  return existingSongs.reduce<Record<SongId, SongId>>((acc, song) => {
    const nextSongId = nextSongIdByNaturalKey.get(buildSongNaturalKey(song));
    if (nextSongId) {
      acc[song.id] = nextSongId;
    }
    return acc;
  }, {});
}

function remapRatings(
  ratings: Record<SongId, RatingRecord>,
  songIdRemap: Record<SongId, SongId>,
) {
  return Object.entries(ratings).reduce<Record<SongId, RatingRecord>>(
    (acc, [songId, rating]) => {
      const nextSongId = songIdRemap[songId] ?? songId;
      acc[nextSongId] = {
        ...rating,
        songId: nextSongId,
      };
      return acc;
    },
    {},
  );
}

function remapMatches(matches: MatchRecord[], songIdRemap: Record<SongId, SongId>) {
  return matches.map((match) => ({
    ...match,
    leftSongId: songIdRemap[match.leftSongId] ?? match.leftSongId,
    rightSongId: songIdRemap[match.rightSongId] ?? match.rightSongId,
  }));
}

function filterMatchesForSongs(matches: MatchRecord[], songs: Song[]) {
  const validSongIds = new Set(songs.map((song) => song.id));
  return matches.filter(
    (match) =>
      validSongIds.has(match.leftSongId) && validSongIds.has(match.rightSongId),
  );
}

function buildLastMatchedAt(matches: MatchRecord[]) {
  return matches.reduce<Record<string, number>>((acc, match, index) => {
    const pairKey = [match.leftSongId, match.rightSongId].sort().join("|");
    acc[pairKey] = matches.length - index - 1;
    return acc;
  }, {});
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

function syncSessionState(state: AppState) {
  const userId = state.user?.id;
  if (!userId) return;
  void saveSessionState(userId, {
    locale: state.locale,
    playlists: state.playlists,
    selectedPlaylistId: state.selectedPlaylistId,
    activeSource: state.activeSource,
    likedSongsImport: state.likedSongsImport,
    lastMatchedAt: state.lastMatchedAt,
  }).catch((error) => {
    console.error("Failed to sync session state.", error);
  });
}

function getDefaultState() {
  return {
    locale: "ko" as AppLocale,
    playlists: [],
    songs: [],
    likedSongsImport: undefined,
    ratings: {},
    matches: [],
    selectedPlaylistId: undefined,
    activeSource: undefined,
    lastMatchedAt: {},
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  auth: undefined,
  user: undefined,
  hydrated: false,
  setHydrated: (hydrated) => set({ hydrated }),
  setAuth: (auth) => set({ auth }),
  setUser: (user) => set({ user }),
  ...getDefaultState(),
  setLocale: (locale) => {
    set({ locale });
    syncSessionState(get());
  },
  setPlaylists: (playlists) => {
    set({ playlists });
    syncSessionState(get());
  },
  selectPlaylist: (selectedPlaylistId) => {
    set({ selectedPlaylistId });
    syncSessionState(get());
  },
  setLikedSongsImport: (likedSongsImport) => {
    set({ likedSongsImport });
    syncSessionState(get());
  },
  setActiveSource: (activeSource) => {
    const syncedActiveSource = syncActiveSourceTrackCount(
      activeSource,
      get().songs,
    );
    set({ activeSource: syncedActiveSource });
    syncSessionState(get());
  },
  importSongs: (songs) => {
    const currentState = get();
    const nextSongs = mergeSongsWithExistingState(songs, currentState.songs);
    const songIdRemap = buildSongIdRemap(nextSongs, currentState.songs);
    const nextRatings = buildRatings(
      nextSongs,
      remapRatings(currentState.ratings, songIdRemap),
    );
    const nextMatches = filterMatchesForSongs(
      remapMatches(currentState.matches, songIdRemap),
      nextSongs,
    );
    const nextLastMatchedAt = buildLastMatchedAt(nextMatches);

    set((state) => ({
      songs: nextSongs,
      ratings: nextRatings,
      matches: nextMatches,
      lastMatchedAt: nextLastMatchedAt,
      activeSource: syncActiveSourceTrackCount(state.activeSource, nextSongs),
    }));
    const nextState = get();
    const userId = nextState.user?.id;
    if (!userId) return;
    void Promise.all([
      replaceLibrary(userId, nextSongs, nextRatings, nextMatches),
      saveSessionState(userId, {
        activeSource: nextState.activeSource,
        lastMatchedAt: nextLastMatchedAt,
        likedSongsImport: nextState.likedSongsImport,
      }),
    ]).catch((error) => {
      console.error("Failed to sync imported songs.", error);
    });
  },
  appendSongs: (songs) => {
    const state = get();
    const existingIds = new Set(state.songs.map((song) => song.id));
    const newSongs = songs.filter((song) => !existingIds.has(song.id));
    if (newSongs.length === 0) return;

    const nextSongs = [...state.songs, ...newSongs];
    const nextState = {
      songs: nextSongs,
      ratings: { ...state.ratings, ...buildRatings(newSongs) },
      activeSource: syncActiveSourceTrackCount(state.activeSource, nextSongs),
    };
    set(nextState);

    const userId = get().user?.id;
    if (!userId) return;
    void Promise.all([
      appendLibrary(userId, newSongs, nextState.ratings),
      saveSessionState(userId, { activeSource: nextState.activeSource }),
    ]).catch((error) => {
      console.error("Failed to sync appended songs.", error);
    });
  },
  assignTier: (songId, tier, uncertain) => {
    set((state) => ({
      songs: state.songs.map((song) =>
        song.id === songId ? { ...song, tier, uncertain } : song,
      ),
      ratings: {
        ...state.ratings,
        [songId]: {
          ...(state.ratings[songId] ?? getDefaultRating(songId)),
          rating: getInitialRatingForTier(tier),
        },
      },
    }));

    const state = get();
    const userId = state.user?.id;
    const song = state.songs.find((item) => item.id === songId);
    if (!userId || !song) return;
    void saveSongAndRating(userId, song, state.ratings[songId]).catch(
      (error) => {
        console.error("Failed to sync tier assignment.", error);
      },
    );
  },
  submitMatch: (leftScore) => {
    const state = get();
    const matchup = buildMatchup(
      state.songs,
      state.ratings,
      state.matches.length,
      state.lastMatchedAt,
    );
    if (!matchup) return;

    const updated = resolveMatchResult(matchup, leftScore);
    const pairKey = [matchup.left.id, matchup.right.id].sort().join("|");
    const nextMatch = {
      id: crypto.randomUUID(),
      leftSongId: matchup.left.id,
      rightSongId: matchup.right.id,
      outcome: leftScore,
      ratingGap: matchup.gap,
      createdAt: new Date().toISOString(),
    } satisfies MatchRecord;
    const nextLastMatchedAt = {
      ...state.lastMatchedAt,
      [pairKey]: state.matches.length,
    };

    set({
      ratings: {
        ...state.ratings,
        [matchup.left.id]: updated.left,
        [matchup.right.id]: updated.right,
      },
      lastMatchedAt: nextLastMatchedAt,
      matches: [nextMatch, ...state.matches],
    });

    const userId = get().user?.id;
    if (!userId) return;
    void insertMatch(
      userId,
      nextMatch,
      [updated.left, updated.right],
      nextLastMatchedAt,
    ).catch((error) => {
      console.error("Failed to sync match result.", error);
    });
  },
  resetFlow: () => {
    const userId = get().user?.id;
    set((state) => ({
      ...getDefaultState(),
      locale: state.locale,
      auth: state.auth,
      user: state.user,
      hydrated: state.hydrated,
    }));
    if (!userId) return;
    void clearUserAppState(userId).catch((error) => {
      console.error("Failed to clear remote session.", error);
    });
  },
  replaceRemoteState: (state) =>
    set({
      locale: state.locale,
      playlists: state.playlists,
      selectedPlaylistId: state.selectedPlaylistId,
      activeSource: syncActiveSourceTrackCount(state.activeSource, state.songs),
      likedSongsImport: state.likedSongsImport,
      lastMatchedAt: state.lastMatchedAt,
      songs: state.songs,
      ratings: state.ratings,
      matches: state.matches,
    }),
  clearSyncedState: () => set(getDefaultState()),
}));
