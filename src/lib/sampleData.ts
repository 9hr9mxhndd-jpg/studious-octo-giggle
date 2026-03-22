import { buildSongId } from './songIdentity';
import type { PlaylistSummary, Song } from '../types';

export const demoPlaylists: PlaylistSummary[] = [
  {
    id: 'demo-liked-songs',
    name: 'Liked Songs',
    description: 'Synthetic saved tracks list for demo mode.',
    imageUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80',
    trackCount: 9,
    isLikedSongs: true,
  },
  {
    id: 'demo-discover-weekly',
    name: 'Discover Weekly Demo',
    description: 'Synthetic playlist so you can explore the ranking flow without logging in.',
    imageUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80',
    trackCount: 9,
  },
  {
    id: 'demo-late-night',
    name: 'Late Night Coding',
    description: 'Dream-pop, electronica, and instrumental grooves.',
    imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80',
    trackCount: 6,
  },
];

export const demoSongs: Song[] = [
  ['1', 'Midnight City', 'M83', 'Hurry Up, We\'re Dreaming'],
  ['2', 'Everything in Its Right Place', 'Radiohead', 'Kid A'],
  ['3', 'Digital Love', 'Daft Punk', 'Discovery'],
  ['4', 'Innerbloom', 'RÜFÜS DU SOL', 'Bloom'],
  ['5', 'Dreams Tonite', 'Alvvays', 'Antisocialites'],
  ['6', 'Teardrop', 'Massive Attack', 'Mezzanine'],
  ['7', 'Sunset Lover', 'Petit Biscuit', 'Presence'],
  ['8', 'Slow Burn', 'Kacey Musgraves', 'Golden Hour'],
  ['9', 'Instant Crush', 'Daft Punk', 'Random Access Memories'],
].map(([id, title, artist, album], index) => ({
  id: buildSongId('demo-discover-weekly', `spotify-${id}`),
  spotifyTrackId: `spotify-${id}`,
  playlistId: 'demo-discover-weekly',
  title,
  artist,
  album,
  imageUrl: `https://picsum.photos/seed/${id}/300/300`,
  previewUrl: undefined,
  durationMs: 180000 + index * 4000,
  uncertain: false,
}));
