import type { Locale } from "./lib/i18n";
import type { SongId } from "./lib/songIdentity";

export type { SongId } from "./lib/songIdentity";

export type Tier = 1 | 2 | 3;

export type SpotifyProduct = "premium" | "free" | "open" | "unknown";

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  // Spotify 원본 플레이리스트/좋아요 곡 총 개수입니다.
  trackCount: number;
  isLikedSongs?: boolean;
}

export interface Song {
  id: SongId;
  spotifyTrackId: string;
  playlistId: string;
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  previewUrl?: string;
  durationMs: number;
  tier?: Tier;
  uncertain: boolean;
}

export interface RatingRecord {
  songId: SongId;
  rating: number;
  matchesPlayed: number;
  lastDelta: number;
}

export interface MatchRecord {
  id: string;
  leftSongId: SongId;
  rightSongId: SongId;
  outcome: number;
  ratingGap: number;
  createdAt: string;
}

export interface Matchup {
  left: Song;
  right: Song;
  leftRating: RatingRecord;
  rightRating: RatingRecord;
  gap: number;
  sameTier: boolean;
}

export interface UserProfile {
  id: string;
  email?: string;
  spotifyProduct: SpotifyProduct;
  isPremium: boolean;
}

export interface AuthSnapshot {
  provider: 'supabase' | 'spotify-direct';
  accessToken?: string;
  refreshToken?: string;
}

export type AppLocale = Locale;
