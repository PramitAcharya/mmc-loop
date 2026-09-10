-- "Who's Free?" read path must BLOCK unverified users, not silently return
-- empty results. Rewrite list_activities / list_activity_comments (replacing
-- the language-sql versions from the main open-feed migration) to raise
-- verification_required when the caller is not a verified student.

create or replace function public.list_activities(_activity_type text default null, _limit integer default 50)
returns setof public.public_activities
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
begin
  if not public.is_verified_student() then
    raise exception 'verification_required';
  end if;
  return query
    select * from public.public_activities a
    where _activity_type is null or a.activity_type = _activity_type
    order by a.available_at asc, a.created_at desc
    limit greatest(1, least(coalesce(_limit, 50), 200));
end;
$fn$;
grant execute on function public.list_activities(text, integer) to authenticated;
revoke all on function public.list_activities(text, integer) from public, anon;

create or replace function public.list_activity_comments(_activity_id uuid)
returns setof public.public_activity_comments
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
begin
  if not public.is_verified_student() then
    raise exception 'verification_required';
  end if;
  return query
    select * from public.public_activity_comments c
    where c.activity_id = _activity_id
    order by c.created_at asc;
end;
$fn$;
grant execute on function public.list_activity_comments(uuid) to authenticated;
revoke all on function public.list_activity_comments(uuid) from public, anon;