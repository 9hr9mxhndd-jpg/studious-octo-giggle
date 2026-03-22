export type SongId = string;

const SONG_ID_PREFIX = "spotify";

export function buildSongId(
  playlistId: string,
  spotifyTrackId: string,
): SongId {
  return `${SONG_ID_PREFIX}:${playlistId}:${spotifyTrackId}`;
}

export function buildSongNaturalKey(song: {
  playlistId: string;
  spotifyTrackId: string;
}): SongId {
  return buildSongId(song.playlistId, song.spotifyTrackId);
}
