
create extension if not exists pg_trgm with schema public;

-- 1. reserved usernames
create table if not exists public.reserved_usernames (
  name text primary key
);
grant select on public.reserved_usernames to anon, authenticated;
grant all on public.reserved_usernames to service_role;
alter table public.reserved_usernames enable row level security;
create policy "reserved usernames readable" on public.reserved_usernames for select using (true);

insert into public.reserved_usernames(name) values
  ('admin'),('administrator'),('moderator'),('mod'),('support'),('system'),('official'),
  ('mmcloop'),('mmc'),('root'),('staff'),('help'),('security'),('api'),('auth'),('login'),
  ('signup'),('feed'),('search'),('create'),('post'),('posts'),('profile'),('activities'),
  ('settings'),('me'),('you'),('anonymous'),('null'),('undefined'),('everyone'),('here')
on conflict do nothing;

-- 2. username constraints
update public.profiles p
set username = regexp_replace(lower(p.username), '[^a-z0-9_]', '', 'g')
where p.username <> regexp_replace(lower(p.username), '[^a-z0-9_]', '', 'g');

alter table public.profiles
  drop constraint if exists profiles_username_format_chk;
alter table public.profiles
  add constraint profiles_username_format_chk
  check (username ~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$');

drop index if exists public.profiles_username_lower_key;
create unique index profiles_username_lower_key on public.profiles (lower(username));

create index if not exists profiles_username_trgm_idx on public.profiles using gin (lower(username) public.gin_trgm_ops);
create index if not exists profiles_display_trgm_idx on public.profiles using gin (lower(coalesce(display_name,'')) public.gin_trgm_ops);
create index if not exists posts_title_trgm_idx on public.posts using gin (lower(title) public.gin_trgm_ops);
create index if not exists posts_body_trgm_idx on public.posts using gin (lower(coalesce(body,'')) public.gin_trgm_ops);

-- 3. username chosen flag
alter table public.profiles add column if not exists username_confirmed boolean not null default false;
update public.profiles p set username_confirmed = true
where exists (
  select 1 from auth.users u
  where u.id = p.id and coalesce(u.raw_user_meta_data->>'username','') <> ''
);

-- 4. block reserved usernames at the db level
create or replace function public.enforce_username_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.reserved_usernames r where r.name = lower(new.username)) then
    raise exception 'username_reserved' using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists profiles_username_rules on public.profiles;
create trigger profiles_username_rules before insert or update of username on public.profiles
for each row execute function public.enforce_username_rules();

-- 5. availability + suggestions + claim
create or replace function public.username_available(_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select _username ~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$'
    and not exists (select 1 from public.reserved_usernames r where r.name = lower(_username))
    and not exists (
      select 1 from public.profiles p
      where lower(p.username) = lower(_username) and p.id is distinct from auth.uid()
    );
$$;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.suggest_usernames(_base text)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  base text;
  cand text;
  out_arr text[] := '{}';
  suffixes text[] := array['_','1','2','_mmc','_np','7','_x','23'];
  s text;
begin
  base := regexp_replace(lower(coalesce(_base,'')), '[^a-z0-9_]', '', 'g');
  base := left(trim(both '_' from base), 16);
  if length(base) < 2 then base := 'student'; end if;
  foreach s in array suffixes loop
    cand := left(base || s, 20);
    cand := regexp_replace(cand, '[^a-z0-9]$', '1');
    if public.username_available(cand) and not (cand = any(out_arr)) then
      out_arr := out_arr || cand;
    end if;
    exit when array_length(out_arr,1) >= 4;
  end loop;
  return out_arr;
end; $$;
grant execute on function public.suggest_usernames(text) to anon, authenticated;

create or replace function public.set_my_username(_username text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if _username !~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$' then
    raise exception 'username_invalid';
  end if;
  if exists (select 1 from public.reserved_usernames r where r.name = lower(_username)) then
    raise exception 'username_reserved';
  end if;
  begin
    update public.profiles
      set username = _username, username_confirmed = true
      where id = uid;
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  return _username;
end; $$;
grant execute on function public.set_my_username(text) to authenticated;

-- 6. search helpers
create or replace function public.search_profiles(_q text, _limit int default 12)
returns table (id uuid, username text, display_name text, avatar_url text, bio text, reputation int)
language sql stable security definer set search_path = public as $$
  with q as (select lower(trim(both ' ' from regexp_replace(coalesce(_q,''), '^@', ''))) as term)
  select p.id, p.username, p.display_name, p.avatar_url, p.bio, p.reputation
  from public.profiles p, q
  where q.term <> ''
    and (lower(p.username) like '%' || q.term || '%'
      or lower(coalesce(p.display_name,'')) like '%' || q.term || '%')
  order by
    (lower(p.username) = q.term) desc,
    (lower(p.username) like q.term || '%') desc,
    p.reputation desc,
    p.username asc
  limit greatest(1, least(coalesce(_limit,12), 50));
$$;
grant execute on function public.search_profiles(text, int) to anon, authenticated;

-- 7. mentions
create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('post','comment')),
  source_id uuid not null,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, mentioned_user_id)
);
create index if not exists mentions_user_idx on public.mentions (mentioned_user_id, created_at desc);
create index if not exists mentions_source_idx on public.mentions (source_type, source_id);

grant select, insert, delete on public.mentions to authenticated;
grant select on public.mentions to anon;
grant all on public.mentions to service_role;
alter table public.mentions enable row level security;

create policy "mentions readable" on public.mentions for select using (true);
create policy "author inserts mentions" on public.mentions for insert to authenticated
with check (
  (source_type = 'post' and exists (select 1 from public.posts p where p.id = source_id and p.author_user_id = auth.uid()))
  or (source_type = 'comment' and exists (select 1 from public.comments c where c.id = source_id and c.author_user_id = auth.uid()))
);
create policy "author deletes mentions" on public.mentions for delete to authenticated
using (
  (source_type = 'post' and exists (select 1 from public.posts p where p.id = source_id and p.author_user_id = auth.uid()))
  or (source_type = 'comment' and exists (select 1 from public.comments c where c.id = source_id and c.author_user_id = auth.uid()))
);

-- 8. keep signup generation aligned with the new rules
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
DECLARE base text; final text; n int := 0; chosen text;
BEGIN
  chosen := nullif(NEW.raw_user_meta_data->>'username','');
  base := lower(regexp_replace(coalesce(chosen, split_part(NEW.email,'@',1),'student'),'[^a-z0-9_]','','g'));
  base := left(trim(both '_' from base), 16);
  IF length(base) < 3 THEN base := 'student' || substr(replace(NEW.id::text,'-',''),1,6); END IF;
  final := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(final))
     OR EXISTS (SELECT 1 FROM public.reserved_usernames r WHERE r.name = lower(final)) LOOP
    n := n + 1; final := left(base, 18) || n::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name, username_confirmed)
  VALUES (NEW.id, final, coalesce(NEW.raw_user_meta_data->>'display_name', final), chosen is not null);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
