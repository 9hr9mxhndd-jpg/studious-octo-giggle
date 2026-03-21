import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildMatchup, getInitialRatingForTier, resolveMatchResult } from '../lib/elo';
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
  // ── 새 필드: 소스 게이팅 ──
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
}

function buildRatings(songs: Song[]) {
  return songs.reduce<Record<string, RatingRecord>>((acc, song) => {
    acc[song.id] = { songId: song.id, rating: 1500, matchesPlayed: 0, lastDelta: 0 };
    return acc;
  }, {});
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      locale: 'ko' as AppLocale,
      playlists: [],
      songs: [],
      likedSongsImport: undefined,
      ratings: {},
      matches: [],
      lastMatchedAt: {},
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setAuth: (auth) => set({ auth }),
      setUser: (user) => set({ user }),
      setLocale: (locale) => set({ locale }),
      setPlaylists: (playlists) => set({ playlists }),
      selectPlaylist: (selectedPlaylistId) => set({ selectedPlaylistId }),
      setLikedSongsImport: (likedSongsImport) => set({ likedSongsImport }),
      setActiveSource: (activeSource) => set({ activeSource }),
      importSongs: (songs) =>
        set({ songs, ratings: buildRatings(songs), matches: [], lastMatchedAt: {} }),
      appendSongs: (songs) =>
        set((state) => {
          const existingIds = new Set(state.songs.map((s) => s.id));
          const newSongs = songs.filter((s) => !existingIds.has(s.id));
          if (newSongs.length === 0) return state;
          return {
            songs: [...state.songs, ...newSongs],
            ratings: { ...state.ratings, ...buildRatings(newSongs) },
          };
        }),
      assignTier: (songId, tier, uncertain) =>
        set((state) => ({
          songs: state.songs.map((s) => (s.id === songId ? { ...s, tier, uncertain } : s)),
          ratings: {
            ...state.ratings,
            [songId]: {
              ...(state.ratings[songId] ?? { songId, matchesPlayed: 0, lastDelta: 0, rating: 1500 }),
              rating: getInitialRatingForTier(tier),
            },
          },
        })),
      submitMatch: (leftScore) => {
        const state = get();
        const matchup = buildMatchup(state.songs, state.ratings, state.matches.length, state.lastMatchedAt);
        if (!matchup) return;

        const updated = resolveMatchResult(matchup, leftScore);
        const pairKey = [matchup.left.id, matchup.right.id].sort().join('|');

        set({
          ratings: {
            ...state.ratings,
            [matchup.left.id]: updated.left,
            [matchup.right.id]: updated.right,
          },
          lastMatchedAt: {
            ...state.lastMatchedAt,
            [pairKey]: state.matches.length,
          },
          matches: [
            {
              id: crypto.randomUUID(),
              leftSongId: matchup.left.id,
              rightSongId: matchup.right.id,
              outcome: leftScore,
              ratingGap: matchup.gap,
              createdAt: new Date().toISOString(),
            },
            ...state.matches,
          ],
        });
      },
      resetFlow: () =>
        set({
          playlists: [],
          songs: [],
          likedSongsImport: undefined,
          ratings: {},
          matches: [],
          selectedPlaylistId: undefined,
          activeSource: undefined,
          lastMatchedAt: {},
        }),
    }),
    {
      name: 'sorter-store-v2',
      partialize: (state) => ({
        auth: state.auth,
        user: state.user,
        locale: state.locale,
        playlists: state.playlists,
        songs: state.songs,
        likedSongsImport: state.likedSongsImport,
        ratings: state.ratings,
        matches: state.matches,
        selectedPlaylistId: state.selectedPlaylistId,
        activeSource: state.activeSource,
        lastMatchedAt: state.lastMatchedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
