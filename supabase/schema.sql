create extension if not exists pgcrypto;

create table if not exists public.sorter_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'ko',
  playlists jsonb not null default '[]'::jsonb,
  selected_playlist_id text,
  active_source jsonb,
  liked_songs_import jsonb,
  last_matched_at jsonb not null default '{}'::jsonb,
  spotify_provider_token text,
  updated_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  spotify_track_id text not null,
  playlist_id text not null,
  title text not null,
  artist text not null,
  album text,
  image_url text,
  preview_url text,
  duration_ms integer,
  tier smallint,
  uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, spotify_track_id, playlist_id)
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  rating numeric not null,
  matches_played integer not null default 0,
  last_delta numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, song_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  left_song_id uuid not null references public.songs(id) on delete cascade,
  right_song_id uuid not null references public.songs(id) on delete cascade,
  outcome numeric not null,
  rating_gap numeric not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_sorter_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sorter_state_updated_at on public.sorter_state;
create trigger set_sorter_state_updated_at
before update on public.sorter_state
for each row execute function public.set_sorter_state_updated_at();

alter table public.sorter_state enable row level security;
alter table public.songs enable row level security;
alter table public.ratings enable row level security;
alter table public.matches enable row level security;

drop policy if exists "sorter state owned by user" on public.sorter_state;
create policy "sorter state owned by user" on public.sorter_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "songs owned by user" on public.songs;
create policy "songs owned by user" on public.songs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ratings owned by user" on public.ratings;
create policy "ratings owned by user" on public.ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "matches owned by user" on public.matches;
create policy "matches owned by user" on public.matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
