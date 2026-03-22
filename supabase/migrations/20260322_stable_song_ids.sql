-- Migrate song identity from random UUIDs to deterministic playlist+Spotify track keys.

begin;

create temp table song_id_map on commit drop as
select
  user_id,
  id::text as old_id,
  concat('spotify:', playlist_id, ':', spotify_track_id) as new_id
from public.songs;

alter table public.ratings drop constraint if exists ratings_song_id_fkey;
alter table public.matches drop constraint if exists matches_left_song_id_fkey;
alter table public.matches drop constraint if exists matches_right_song_id_fkey;

alter table public.songs alter column id drop default;
alter table public.songs alter column id type text using id::text;
alter table public.ratings alter column song_id type text using song_id::text;
alter table public.matches alter column left_song_id type text using left_song_id::text;
alter table public.matches alter column right_song_id type text using right_song_id::text;

update public.songs songs
set id = map.new_id
from song_id_map map
where songs.user_id = map.user_id
  and songs.id = map.old_id;

update public.ratings ratings
set song_id = map.new_id
from song_id_map map
where ratings.user_id = map.user_id
  and ratings.song_id = map.old_id;

update public.matches matches
set left_song_id = map.new_id
from song_id_map map
where matches.user_id = map.user_id
  and matches.left_song_id = map.old_id;

update public.matches matches
set right_song_id = map.new_id
from song_id_map map
where matches.user_id = map.user_id
  and matches.right_song_id = map.old_id;

alter table public.ratings
  add constraint ratings_song_id_fkey
  foreign key (song_id) references public.songs(id) on delete cascade;

alter table public.matches
  add constraint matches_left_song_id_fkey
  foreign key (left_song_id) references public.songs(id) on delete cascade;

alter table public.matches
  add constraint matches_right_song_id_fkey
  foreign key (right_song_id) references public.songs(id) on delete cascade;

with ranked_matches as (
  select
    user_id,
    concat_ws('|', least(left_song_id, right_song_id), greatest(left_song_id, right_song_id)) as pair_key,
    row_number() over (partition by user_id order by created_at asc, id asc) - 1 as match_index
  from public.matches
),
latest_pairs as (
  select distinct on (user_id, pair_key)
    user_id,
    pair_key,
    match_index
  from ranked_matches
  order by user_id, pair_key, match_index desc
),
rebuilt_last_matched_at as (
  select
    user_id,
    jsonb_object_agg(pair_key, match_index) as last_matched_at
  from latest_pairs
  group by user_id
)
update public.sorter_state sorter_state
set last_matched_at = coalesce(rebuilt_last_matched_at.last_matched_at, '{}'::jsonb)
from rebuilt_last_matched_at
where sorter_state.user_id = rebuilt_last_matched_at.user_id;

commit;
