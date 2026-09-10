-- Student verification and gating.
-- Two experiences: visitors (read-only) and verified MMC students (interact).
-- Verification is controlled only by staff server-side via set_verification_status.

alter table public.profiles
  add column verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  add column verification_reason text,
  add column verified_at timestamptz;

-- Trusted early accounts become verified students so the platform stays
-- usable while the verification workflow is wired up.
update public.profiles
   set verification_status = 'verified', verified_at = now()
 where verification_status = 'pending';

create index if not exists profiles_verification_status_idx
  on public.profiles (verification_status);

-- True when the caller is a verified student or staff (admin/moderator).
create or replace function public.is_verified_student()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
  select auth.uid() is not null and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.verification_status = 'verified'
    )
    or exists (
      select 1 from public.user_roles r
      where r.user_id = auth.uid() and r.role in ('admin', 'moderator')
    )
  );
$fn$;

-- Staff-only state change: approve, reject or reset a student's verification.
-- Raised exceptions: not_authenticated, staff_only, invalid_verification_status, user_not_found.
create or replace function public.set_verification_status(_user_id uuid, _status text, _reason text default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_moderator(auth.uid()) then
    raise exception 'staff_only';
  end if;
  if _status not in ('pending', 'verified', 'rejected') then
    raise exception 'invalid_verification_status';
  end if;
  if not exists (select 1 from public.profiles where id = _user_id) then
    raise exception 'user_not_found';
  end if;

  perform set_config('app.verification_system_update', 'on', true);
  update public.profiles
     set verification_status = _status,
         verification_reason = case
             when _status = 'rejected' then nullif(trim(coalesce(_reason, '')), '')
             else null
           end,
         verified_at = case when _status = 'verified' then now() else null end,
         updated_at = now()
   where id = _user_id;
end;
$fn$;

-- Block users from flipping their own verification state through the normal
-- profiles UPDATE policy (auth.uid() = id). Only the internal flag set by
-- set_verification_status may change these columns.
create or replace function public.guard_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $fn$
begin
  if (new.verification_status is distinct from old.verification_status
      or new.verified_at is distinct from old.verified_at
      or new.verification_reason is distinct from old.verification_reason)
     and coalesce(current_setting('app.verification_system_update', true), '') <> 'on' then
    raise exception 'verification_status_is_read_only';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_guard_profile_verification on public.profiles;
create trigger trg_guard_profile_verification
  before update on public.profiles
  for each row execute function public.guard_profile_verification();

-- Interaction gating: read-only for visitors, verified students act.

alter policy "insert own posts" on public.posts
  with check (
    auth.uid() = author_user_id
    and is_demo = false
    and public.is_verified_student()
  );

alter policy "insert own comments" on public.comments
  with check (auth.uid() = author_user_id and public.is_verified_student());

alter policy "insert own activity" on public.activities
  with check (
    auth.uid() = creator_user_id
    and is_demo = false
    and public.is_verified_student()
  );

alter policy "insert own response" on public.activity_responses
  with check (auth.uid() = user_id and public.is_verified_student());

alter policy "member can send messages to direct conversations" on public.messages
  with check (
    sender_id = auth.uid()
    and public.is_verified_student()
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

alter policy "members create reports" on public.reports
  with check (auth.uid() = reporter_user_id and public.is_verified_student());

-- Voting: only verified students may vote (secdef RPCs).
create or replace function public.vote_post(_post_id uuid, _value smallint)
 returns TABLE(score integer, user_vote smallint)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  _author_user_id uuid;
  _is_demo boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'verification_required';
  END IF;

  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
  END IF;

  SELECT p.author_user_id, p.is_demo
    INTO _author_user_id, _is_demo
  FROM public.posts p
  WHERE p.id = _post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  IF _is_demo THEN
    RAISE EXCEPTION 'demo_content_untouchable';
  END IF;

  IF _author_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_vote_not_allowed';
  END IF;

  IF _value = 0 THEN
    DELETE FROM public.post_votes
    WHERE post_id = _post_id AND user_id = auth.uid();
  ELSE
    INSERT INTO public.post_votes (post_id, user_id, value)
    VALUES (_post_id, auth.uid(), _value)
    ON CONFLICT (post_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RETURN QUERY
  SELECT p.score,
         COALESCE(v.value, 0)::smallint
  FROM public.posts p
  LEFT JOIN public.post_votes v
    ON v.post_id = p.id AND v.user_id = auth.uid()
  WHERE p.id = _post_id AND p.status = 'visible';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;
END;
$function$;

create or replace function public.vote_comment(_comment_id uuid, _value smallint)
 returns TABLE(score integer, user_vote smallint)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  _author_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'verification_required';
  END IF;

  IF _value NOT IN (-1, 0, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
  END IF;

  SELECT c.author_user_id
    INTO _author_user_id
  FROM public.comments c
  WHERE c.id = _comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  IF _author_user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_vote_not_allowed';
  END IF;

  IF _value = 0 THEN
    DELETE FROM public.comment_votes
    WHERE comment_id = _comment_id AND user_id = auth.uid();
  ELSE
    INSERT INTO public.comment_votes (comment_id, user_id, value)
    VALUES (_comment_id, auth.uid(), _value)
    ON CONFLICT (comment_id, user_id)
    DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RETURN QUERY
  SELECT c.score,
         COALESCE(v.value, 0)::smallint
  FROM public.comments c
  LEFT JOIN public.comment_votes v
    ON v.comment_id = c.id AND v.user_id = auth.uid()
  WHERE c.id = _comment_id AND c.status = 'visible';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;
END;
$function$;

-- Chat: verified students only.
create or replace function public.ensure_direct_conversation(_peer_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  first_user uuid;
  second_user uuid;
  conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _peer_id IS NULL OR _peer_id = auth.uid() THEN
    RAISE EXCEPTION 'invalid_conversation_participant';
  END IF;
  IF NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'verification_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _peer_id) THEN
    RAISE EXCEPTION 'invalid_conversation_participant';
  END IF;
  IF auth.uid() < _peer_id THEN
    first_user := auth.uid(); second_user := _peer_id;
  ELSE
    first_user := _peer_id; second_user := auth.uid();
  END IF;

  INSERT INTO public.conversations (participant_a, participant_b, updated_at)
  VALUES (first_user, second_user, now())
  ON CONFLICT (participant_a, participant_b)
    WHERE participant_a IS NOT NULL AND participant_b IS NOT NULL
    DO UPDATE SET updated_at = public.conversations.updated_at
  RETURNING id INTO conversation_id;
  IF conversation_id IS NULL THEN
    SELECT id INTO conversation_id FROM public.conversations
    WHERE participant_a = first_user AND participant_b = second_user;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conversation_id, first_user), (conversation_id, second_user)
  ON CONFLICT DO NOTHING;
  RETURN conversation_id;
END;
$function$;

-- Post images: only verified students may upload/delete.
alter policy "members upload own post images" on storage.objects
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.is_verified_student()
  );

alter policy "members delete own post images" on storage.objects
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.is_verified_student()
  );

-- Expose verification on public surfaces for subtle badges.

-- OUT-param shape changed, so these drop before recreate.
drop function if exists public.search_profiles(text, integer);
drop function if exists public.chat_conversation_summaries();

create or replace function public.search_profiles(_q text, _limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, bio text, reputation integer, verification_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (select lower(trim(both ' ' from regexp_replace(coalesce(_q,''), '^@', ''))) as term)
  select p.id, p.username, p.display_name, p.avatar_url, p.bio, p.reputation, p.verification_status
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
$function$;

create or replace function public.chat_conversation_summaries()
 RETURNS TABLE(conversation_id uuid, updated_at timestamp with time zone, other_user_id uuid, other_username text, other_display_name text, other_avatar_url text, other_verified boolean, last_message text, last_message_at timestamp with time zone, unread_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.updated_at,
    peer.id,
    peer.username,
    peer.display_name,
    peer.avatar_url,
    (peer.verification_status = 'verified' OR public.is_moderator(peer.id)),
    latest.content,
    latest.created_at,
    (
      SELECT count(*)
      FROM public.messages unread
      JOIN public.conversation_members own
        ON own.conversation_id = unread.conversation_id
       AND own.user_id = auth.uid()
      WHERE unread.conversation_id = c.id
        AND unread.sender_id <> auth.uid()
        AND (own.last_read_at IS NULL OR unread.created_at > own.last_read_at)
    )
  FROM public.conversations c
  JOIN public.conversation_members own
    ON own.conversation_id = c.id
   AND own.user_id = auth.uid()
  JOIN public.conversation_members peer_member
    ON peer_member.conversation_id = c.id
   AND peer_member.user_id <> auth.uid()
  JOIN public.profiles peer ON peer.id = peer_member.user_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) latest ON true
  ORDER BY c.updated_at DESC
  LIMIT 50;
$function$;

create or replace view public.public_activities as
 SELECT a.id,
    a.activity_type,
    a.message,
    a.available_at,
    a.duration_minutes,
    a.is_demo,
    a.created_at,
    a.creator_user_id AS creator_id,
    pr.username AS creator_username,
    pr.avatar_url AS creator_avatar_url,
    (pr.verification_status = 'verified') AS creator_verified,
    ( SELECT count(*) AS count
           FROM activity_responses r
          WHERE (r.activity_id = a.id)) AS response_count
   FROM (activities a
     LEFT JOIN profiles pr ON ((pr.id = a.creator_user_id)))
  WHERE (a.status = 'visible'::text);

create or replace view public.public_comments as
 SELECT cm.id,
    cm.post_id,
    cm.parent_id,
    cm.body,
    cm.is_anonymous,
    cm.score,
    cm.created_at,
    cm.updated_at,
        CASE
            WHEN cm.is_anonymous THEN NULL::uuid
            ELSE cm.author_user_id
        END AS author_id,
        CASE
            WHEN cm.is_anonymous THEN NULL::text
            ELSE pr.username
        END AS author_username,
        CASE
            WHEN cm.is_anonymous THEN NULL::text
            ELSE pr.avatar_url
        END AS author_avatar_url,
    (cm.author_user_id = auth.uid()) AS is_owner,
    (pr.verification_status = 'verified') AS author_verified
   FROM ((comments cm
     JOIN posts p ON (((p.id = cm.post_id) AND (p.status = 'visible'::text))))
     LEFT JOIN profiles pr ON ((pr.id = cm.author_user_id)))
  WHERE (cm.status = 'visible'::text);

create or replace view public.public_posts as
 SELECT p.id,
    p.title,
    p.body,
    p.category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    c.emoji AS category_emoji,
    p.image_url,
    p.is_anonymous,
    p.is_demo,
    p.score,
    p.comment_count,
    p.created_at,
    p.updated_at,
        CASE
            WHEN p.is_anonymous THEN NULL::uuid
            ELSE p.author_user_id
        END AS author_id,
        CASE
            WHEN p.is_anonymous THEN NULL::text
            ELSE pr.username
        END AS author_username,
        CASE
            WHEN p.is_anonymous THEN NULL::text
            ELSE pr.avatar_url
        END AS author_avatar_url,
    (p.author_user_id = auth.uid()) AS is_owner,
    (pr.verification_status = 'verified') AS author_verified
   FROM ((posts p
     JOIN categories c ON ((c.id = p.category_id)))
     LEFT JOIN profiles pr ON ((pr.id = p.author_user_id)))
  WHERE (p.status = 'visible'::text);