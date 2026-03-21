import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlaylistCard } from '../components/PlaylistCard';
import { getUserPlaylists, importPlaylistTracks } from '../lib/spotify';
import { getCopy } from '../lib/i18n';
import { useAppStore } from '../store/appStore';

export function PlaylistSetupPage() {
  const navigate = useNavigate();
  const { auth, playlists, selectedPlaylistId, setPlaylists, selectPlaylist, importSongs } = useAppStore();
  const user = useAppStore((state) => state.user);
  const copy = getCopy(useAppStore((state) => state.locale));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const fetchedPlaylists = await getUserPlaylists(auth?.accessToken);
        if (cancelled) {
          return;
        }
        setPlaylists(fetchedPlaylists);
      } catch (unknownError) {
        if (!cancelled) {
          setError(unknownError instanceof Error ? unknownError.message : copy.playlist.loadError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [auth?.accessToken, copy.playlist.loadError, setPlaylists]);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId),
    [playlists, selectedPlaylistId],
  );

  const handleImport = async () => {
    if (!selectedPlaylistId) {
      setError(copy.playlist.selectError);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const songs = await importPlaylistTracks(selectedPlaylistId, auth?.accessToken);
      if (songs.length === 0) {
        setError(copy.playlist.importError);
        return;
      }

      importSongs(songs);
      navigate('/setup/bucket');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : copy.playlist.importError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-white">{copy.playlist.title}</h1>
          <p className="mt-3 max-w-2xl text-slate-300">{copy.playlist.description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleImport();
          }}
          className="rounded-full bg-brand-500 px-6 py-3 font-medium text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading || !selectedPlaylist}
        >
          {loading ? copy.playlist.importing : copy.playlist.importTracks}
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div>{error}</div>
        </div>
      ) : null}

      <section className="rounded-[2rem] border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
        <div className="font-medium text-white">{copy.playlist.loginDeniedTitle}</div>
        <p className="mt-2">{copy.playlist.loginDeniedBody}</p>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span className="rounded-full bg-white/10 px-4 py-2">{copy.playlist.playbackMode}: {user?.isPremium ? copy.playlist.playbackPremium : copy.playlist.playbackFree}</span>
          <span className="rounded-full bg-white/10 px-4 py-2">{copy.playlist.product}: {user?.spotifyProduct ?? 'demo'}</span>
          <span className="rounded-full bg-white/10 px-4 py-2">{copy.playlist.selectedPlaylist}: {selectedPlaylist?.name ?? copy.playlist.none}</span>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {playlists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} selected={playlist.id === selectedPlaylistId} onSelect={selectPlaylist} />
        ))}
      </section>
    </div>
  );
}
