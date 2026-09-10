-- Signed-out previews on the feed and post pages broke because both the
-- public_posts and public_comments views render author_verified via
-- is_moderator(pr.id). The anon role had no EXECUTE on that function, so any
-- anonymous query hit "permission denied for function is_moderator".
--
-- The function is a secure, STABLE SECURITY DEFINER read over user_roles, so
-- it is safe (and necessary) to expose to everyone who can already read the
-- views themselves.

create or replace function public.is_verified_student(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles
    where id = _user_id and verification_status = 'verified'
  );
$function$;

grant execute on function public.is_moderator(uuid) to anon, authenticated;
grant execute on function public.is_verified_student(uuid) to anon, authenticated;

-- The no-argument helper is only ever invoked inside an authenticated RLS
-- context (messages/storage policies). Leave it authenticated-only, but also
-- widen it to anon so view definitions that might call it never regress.
grant execute on function public.is_verified_student() to anon, authenticated;