import { create } from 'zustand';
import { buildMatchup, getInitialRatingForTier, resolveMatchResult } from '../lib/elo';
import {
  appendLibrary,
  clearUserAppState,
  insertMatch,
  replaceLibrary,
  saveSessionState,
  saveSongAndRating,
  type RemoteAppState,
} from '../lib/appSync';
import type { AppLocale, AuthSnapshot, MatchRecord, PlaylistSummary, RatingRecord, Song, Tier, UserProfile } from '../types';

export interface ActiveSource {
  id: string;
  name: string;
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
  ratings: Record<string, RatingRecord>;
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
  importSongs: (songs: Song[]) => void;
  appendSongs: (songs: Song[]) => void;
  assignTier: (songId: string, tier: Tier, uncertain: boolean) => void;
  submitMatch: (leftScore: number) => void;
  resetFlow: () => void;
  replaceRemoteState: (state: RemoteAppState) => void;
  clearSyncedState: () => void;
}

function buildRatings(songs: Song[]) {
  return songs.reduce<Record<string, RatingRecord>>((acc, song) => {
    acc[song.id] = { songId: song.id, rating: 1500, matchesPlayed: 0, lastDelta: 0 };
    return acc;
  }, {});
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
    console.error('Failed to sync session state.', error);
  });
}

function getDefaultState() {
  return {
    locale: 'ko' as AppLocale,
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
    set({ activeSource });
    syncSessionState(get());
  },
  importSongs: (songs) => {
    const nextRatings = buildRatings(songs);
    set({ songs, ratings: nextRatings, matches: [], lastMatchedAt: {} });
    const state = get();
    const userId = state.user?.id;
    if (!userId) return;
    void Promise.all([
      replaceLibrary(userId, songs, nextRatings),
      saveSessionState(userId, { lastMatchedAt: {}, likedSongsImport: state.likedSongsImport }),
    ]).catch((error) => {
      console.error('Failed to sync imported songs.', error);
    });
  },
  appendSongs: (songs) => {
    const state = get();
    const existingIds = new Set(state.songs.map((song) => song.id));
    const newSongs = songs.filter((song) => !existingIds.has(song.id));
    if (newSongs.length === 0) return;

    const nextState = {
      songs: [...state.songs, ...newSongs],
      ratings: { ...state.ratings, ...buildRatings(newSongs) },
    };
    set(nextState);

    const userId = get().user?.id;
    if (!userId) return;
    void appendLibrary(userId, newSongs, nextState.ratings).catch((error) => {
      console.error('Failed to sync appended songs.', error);
    });
  },
  assignTier: (songId, tier, uncertain) => {
    set((state) => ({
      songs: state.songs.map((song) => (song.id === songId ? { ...song, tier, uncertain } : song)),
      ratings: {
        ...state.ratings,
        [songId]: {
          ...(state.ratings[songId] ?? { songId, matchesPlayed: 0, lastDelta: 0, rating: 1500 }),
          rating: getInitialRatingForTier(tier),
        },
      },
    }));

    const state = get();
    const userId = state.user?.id;
    const song = state.songs.find((item) => item.id === songId);
    if (!userId || !song) return;
    void saveSongAndRating(userId, song, state.ratings[songId]).catch((error) => {
      console.error('Failed to sync tier assignment.', error);
    });
  },
  submitMatch: (leftScore) => {
    const state = get();
    const matchup = buildMatchup(state.songs, state.ratings, state.matches.length, state.lastMatchedAt);
    if (!matchup) return;

    const updated = resolveMatchResult(matchup, leftScore);
    const pairKey = [matchup.left.id, matchup.right.id].sort().join('|');
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
    void insertMatch(userId, nextMatch, [updated.left, updated.right], nextLastMatchedAt).catch((error) => {
      console.error('Failed to sync match result.', error);
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
      console.error('Failed to clear remote session.', error);
    });
  },
  replaceRemoteState: (state) => set({
    locale: state.locale,
    playlists: state.playlists,
    selectedPlaylistId: state.selectedPlaylistId,
    activeSource: state.activeSource,
    likedSongsImport: state.likedSongsImport,
    lastMatchedAt: state.lastMatchedAt,
    songs: state.songs,
    ratings: state.ratings,
    matches: state.matches,
  }),
  clearSyncedState: () => set(getDefaultState()),
}));
