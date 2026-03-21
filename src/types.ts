import type { Locale } from './lib/i18n';

export type Tier = 1 | 2 | 3;

export type SpotifyProduct = 'premium' | 'free' | 'open' | 'unknown';

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  trackCount: number;
  isLikedSongs?: boolean;
}

export interface Song {
  id: string;
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
  songId: string;
  rating: number;
  matchesPlayed: number;
  lastDelta: number;
}

export interface MatchRecord {
  id: string;
  leftSongId: string;
  rightSongId: string;
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
  accessToken?: string;
  refreshToken?: string;
}

export type AppLocale = Locale;
