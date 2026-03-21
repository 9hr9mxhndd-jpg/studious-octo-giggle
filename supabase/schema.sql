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

alter table public.songs enable row level security;
alter table public.ratings enable row level security;
alter table public.matches enable row level security;

create policy "songs owned by user" on public.songs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ratings owned by user" on public.ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "matches owned by user" on public.matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
