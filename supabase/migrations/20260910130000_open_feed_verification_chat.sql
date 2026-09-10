-- Open the community feed to every signed-in member (unverified students can
-- create posts, comment, reply and vote). Keep "Who's Free?" verified-only on
-- the server, and unblock the private verification chat between an applicant
-- and the moderator who claimed their verification request.

-- ============================================================
-- 1) FEED: public community interaction for all members
-- ============================================================

drop policy if exists "verified students insert own posts" on public.posts;
create policy "members insert own posts" on public.posts
  for insert to authenticated
  with check (auth.uid() = author_user_id and is_demo = false);

drop policy if exists "verified students insert own comments" on public.comments;
create policy "members insert own comments" on public.comments
  for insert to authenticated
  with check (auth.uid() = author_user_id);

drop policy if exists "members create reports" on public.reports;
create policy "members create reports" on public.reports
  for insert to authenticated
  with check (auth.uid() = reporter_user_id);

-- Voting is now open to every signed-in member (visitors still cannot vote).
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

-- Post images: any member may upload into their own folder.
drop policy if exists "members upload own post images" on storage.objects;
create policy "members upload own post images" on storage.objects
  for insert with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "members delete own post images" on storage.objects;
create policy "members delete own post images" on storage.objects
  for delete using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- ============================================================
-- 2) "Who's Free?" is verified-only on the server too
-- ============================================================

-- Base tables: verified students (or staff) may read visible activity content.
drop policy if exists "activities readable by members" on public.activities;
create policy "verified students read activities" on public.activities
  for select to authenticated using (public.is_verified_student());

drop policy if exists "responses readable by members" on public.activity_responses;
create policy "verified students read activity responses" on public.activity_responses
  for select to authenticated using (public.is_verified_student());

drop policy if exists "visible activity comments readable by members" on public.activity_comments;
create policy "verified students read visible activity comments" on public.activity_comments
  for select to authenticated using (status = 'visible' and public.is_verified_student());

-- Sanctioned read path: SECURITY DEFINER functions that explicitly demand a
-- verified student. The public_* views stay as internal helpers but are no
-- longer directly readable by any client role (they ran with the owner's
-- privileges, which would have leaked activity content to unverified users).

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

revoke select on public.public_activities from anon, authenticated;
revoke select on public.public_activity_comments from anon, authenticated;

-- ============================================================
-- 3) Private verification chat (applicant <-> claiming moderator)
-- ============================================================

-- True when the caller may open a direct conversation with _peer_id:
--   * the caller is a verified student (or staff), OR
--   * the caller is a moderator and _peer_id's request is claimed by them, OR
--   * _peer_id is the moderator who claimed the caller's request.
create or replace function public.can_chat_with_peer(_peer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
  select (public.is_verified_student() and exists (select 1 from auth.users where id = _peer_id))
      or (public.is_moderator(auth.uid()) and exists (
            select 1 from public.verification_requests vr
            where vr.user_id = _peer_id
              and vr.claimed_by = auth.uid()
              and vr.status in ('open', 'claimed')
          ))
      or (public.is_moderator(_peer_id) and exists (
            select 1 from public.verification_requests vr
            where vr.user_id = auth.uid()
              and vr.claimed_by = _peer_id
              and vr.status in ('open', 'claimed')
          ));
$fn$;
grant execute on function public.can_chat_with_peer(uuid) to authenticated;
revoke all on function public.can_chat_with_peer(uuid) from public, anon;

-- True when _conversation_id is a 1:1 conversation between _user_id (the
-- applicant) and the moderator who claimed their open/claimed request.
create or replace function public.is_verification_conversation(_conversation_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
  select exists (
    select 1
    from public.conversation_members me
    join public.conversation_members peer
      on peer.conversation_id = me.conversation_id
     and peer.user_id <> me.user_id
    join public.verification_requests vr
      on vr.user_id = _user_id
     and vr.claimed_by = peer.user_id
     and vr.status in ('open', 'claimed')
    where me.conversation_id = _conversation_id
      and me.user_id = _user_id
  );
$fn$;
grant execute on function public.is_verification_conversation(uuid, uuid) to authenticated;
revoke all on function public.is_verification_conversation(uuid, uuid) from public, anon;

-- Private chat: a member may send messages when they are verified OR when the
-- conversation is their active verification chat.
drop policy if exists "verified students can send direct messages" on public.messages;
drop policy if exists "member can send messages to direct conversations" on public.messages;
create policy "members send direct messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
    and (public.is_verified_student()
         or public.is_verification_conversation(messages.conversation_id, auth.uid()))
  );

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
  IF NOT public.can_chat_with_peer(_peer_id) THEN
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
grant execute on function public.ensure_direct_conversation(uuid) to authenticated;
revoke all on function public.ensure_direct_conversation(uuid) from public, anon;

-- Attachment upload: any member of the conversation may upload when verified,
-- or when the conversation is their active verification chat.
create or replace function public.can_upload_chat_attachment(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
declare
  conv uuid;
  head text;
  ok boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if not public.is_allowed_chat_file(_name) then return false; end if;
  head := (storage.foldername(_name))[1];
  if head is null or not head ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  conv := head::uuid;
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conv and cm.user_id = auth.uid()
  ) into ok;
  if not ok then return false; end if;
  if public.is_verified_student() then return true; end if;
  return public.is_verification_conversation(conv, auth.uid());
end;
$fn$;

-- ============================================================
-- 4) Fix verification resolution vs. the profile guard trigger
-- ============================================================

-- resolve_verification_request updates profiles.verification_status, which is
-- protected by trg_guard_profile_verification unless the internal
-- app.verification_system_update flag is turned on for the statement.
create or replace function public.resolve_verification_request(
  _request_id uuid,
  _approved boolean,
  _mod_note text DEFAULT NULL
)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  _user_id uuid := auth.uid();
  _request record;
  _new_status text;
BEGIN
  IF NOT is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  SELECT * INTO _request
  FROM verification_requests
  WHERE id = _request_id AND status = 'claimed' AND claimed_by = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, not claimed by you, or already resolved';
  END IF;

  _new_status := CASE WHEN _approved THEN 'approved' ELSE 'rejected' END;

  UPDATE verification_requests
  SET status = _new_status,
      mod_note = _mod_note,
      updated_at = now()
  WHERE id = _request_id;

  IF _approved THEN
    PERFORM set_config('app.verification_system_update', 'on', true);
    UPDATE profiles
    SET verification_status = 'verified',
        verified_at = now(),
        updated_at = now()
    WHERE id = _request.user_id;
  ELSE
    PERFORM set_config('app.verification_system_update', 'on', true);
    UPDATE profiles
    SET verification_status = 'rejected',
        verification_reason = _mod_note,
        updated_at = now()
    WHERE id = _request.user_id;
  END IF;
END;
$$;

-- ============================================================
-- 5) Conversation summaries: surface media messages
-- ============================================================

drop function if exists public.chat_conversation_summaries();

create function public.chat_conversation_summaries()
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
    COALESCE(latest.content, latest.attachment_name, '[Attachment]'),
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
    SELECT m.content, m.attachment_name, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) latest ON true
  ORDER BY c.updated_at DESC
  LIMIT 50;
$function$;
grant execute on function public.chat_conversation_summaries() to authenticated;
revoke all on function public.chat_conversation_summaries() from public, anon;