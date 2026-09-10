-- Verification portal: a separate, temporary chat between the applicant and
-- the moderator who claimed their verification request.  The portal is truly
-- temporary — all chat rows (and references to storage objects) are deleted
-- when the request is resolved.
--
-- General-chat verification exemptions are reverted: messaging is once again
-- verified-only.  Chat attachments are opened to any conversation member
-- (verified or not), matching the requirement that "attachments/images are
-- available for anyone in private chats".

-- ============================================================
-- 1) Revert: restore verified-only general chat
-- ============================================================

-- Rewrite can_upload_chat_attachment to membership-only (drop verified +
-- verification-conversation exemption).  This must happen first because the
-- old version references is_verification_conversation which we will drop.
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
  return ok;
end;
$fn$;

-- Drop the old upload policy and recreate with a clearer name (no longer
-- "verified members" — any conversation member may upload).
drop policy if exists "verified members upload chat attachments" on storage.objects;
create policy "members upload chat attachments" on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and public.can_upload_chat_attachment(name)
  );

-- Drop helper functions that are no longer needed.  The messages policy that
-- referenced is_verification_conversation is dropped first.
drop policy if exists "members send direct messages" on public.messages;
drop function if exists public.can_chat_with_peer(uuid);
drop function if exists public.is_verification_conversation(uuid, uuid);

-- Restore verified-only message sending.
drop policy if exists "verified students can send direct messages" on public.messages;
create policy "verified students can send direct messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    AND public.is_verified_student(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Restore verified-only conversation creation.
create or replace function public.ensure_direct_conversation(_peer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  conversation_id uuid;
BEGIN
  IF NOT public.is_verified_student(auth.uid())
     OR NOT public.is_verified_student(_peer_id) THEN
    RAISE EXCEPTION 'verified_students_only';
  END IF;
  IF _peer_id IS NULL OR _peer_id = auth.uid() THEN
    RAISE EXCEPTION 'invalid_direct_recipient';
  END IF;

  SELECT c.id INTO existing_id
  FROM public.conversations c
  WHERE c.participant_a = LEAST(auth.uid(), _peer_id)
    AND c.participant_b = GREATEST(auth.uid(), _peer_id)
  LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  INSERT INTO public.conversations (participant_a, participant_b)
  VALUES (LEAST(auth.uid(), _peer_id), GREATEST(auth.uid(), _peer_id))
  RETURNING id INTO conversation_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conversation_id, auth.uid()), (conversation_id, _peer_id);
  RETURN conversation_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_direct_conversation(uuid) FROM public, anon;

-- ============================================================
-- 2) Portal tables
-- ============================================================

-- One row per verification request that has a portal chat.  The row is
-- deleted when the request is resolved (cascade deletes messages).
create table if not exists public.verification_chats (
  request_id uuid primary key
    references public.verification_requests(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.verification_chats to authenticated;
alter table public.verification_chats enable row level security;

-- Messages inside the verification portal.
create table if not exists public.verification_chat_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.verification_chats(request_id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'document', 'voice')),
  content text,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  constraint verification_chat_messages_content_check check (
    (message_type = 'text'
      and char_length(trim(both from content)) > 0
      and char_length(content) <= 500
      and attachment_url is null
      and attachment_name is null
      and attachment_type is null
      and attachment_size is null)
    or (message_type in ('image', 'document', 'voice')
      and content is null
      and attachment_url is not null
      and public.is_allowed_chat_file(attachment_url))
  )
);
create index if not exists verification_chat_messages_request_created_idx
  on public.verification_chat_messages (request_id, created_at, id);
grant select on public.verification_chat_messages to authenticated;
alter table public.verification_chat_messages enable row level security;

-- ============================================================
-- 3) Portal helper + RLS policies
-- ============================================================

create or replace function public.can_participate_verification_chat(_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
  select exists (
    select 1 from public.verification_requests vr
    where vr.id = _request_id
      and vr.status in ('open', 'claimed')
      and (vr.user_id = auth.uid() or vr.claimed_by = auth.uid())
  );
$fn$;
grant execute on function public.can_participate_verification_chat(uuid) to authenticated;
revoke all on function public.can_participate_verification_chat(uuid) from public, anon;

-- SELECT: only participants may read.
create policy "verification chat participants select"
  on public.verification_chats
  for select to authenticated
  using (public.can_participate_verification_chat(request_id));

create policy "verification chat participants select messages"
  on public.verification_chat_messages
  for select to authenticated
  using (public.can_participate_verification_chat(request_id));

-- INSERT: participants may send as themselves.
create policy "verification chat participants send"
  on public.verification_chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_participate_verification_chat(request_id)
  );

-- ============================================================
-- 4) Portal RPCs
-- ============================================================

create or replace function public.open_verification_chat(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.can_participate_verification_chat(_request_id) then
    raise exception 'verification_chat_unavailable';
  end if;
  insert into public.verification_chats (request_id)
  values (_request_id)
  on conflict do nothing;
end;
$$;
grant execute on function public.open_verification_chat(uuid) to authenticated;
revoke all on function public.open_verification_chat(uuid) from public, anon;

create or replace function public.list_verification_chat_messages(_request_id uuid)
returns setof public.verification_chat_messages
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select *
  from public.verification_chat_messages vcm
  where vcm.request_id = _request_id
    and public.can_participate_verification_chat(_request_id)
  order by vcm.created_at asc, vcm.id asc;
$fn$;
grant execute on function public.list_verification_chat_messages(uuid) to authenticated;
revoke all on function public.list_verification_chat_messages(uuid) from public, anon;

create or replace function public.send_verification_chat_message(
  _request_id uuid,
  _content text default null,
  _attachment_url text default null,
  _attachment_name text default null,
  _attachment_type text default null,
  _attachment_size bigint default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  _message_type text;
begin
  if not public.can_participate_verification_chat(_request_id) then
    raise exception 'verification_chat_unavailable';
  end if;

  if _attachment_url is null then
    _message_type := 'text';
  elsif _attachment_url ~* '\.(png|jpe?g|gif|webp)$' then
    _message_type := 'image';
  else
    _message_type := 'document';
  end if;

  insert into public.verification_chat_messages (
    request_id, sender_id, message_type,
    content, attachment_url, attachment_name, attachment_type, attachment_size
  ) values (
    _request_id, auth.uid(), _message_type,
    _content, _attachment_url, _attachment_name, _attachment_type, _attachment_size
  );
end;
$$;
grant execute on function public.send_verification_chat_message(uuid, text, text, text, text, bigint) to authenticated;
revoke all on function public.send_verification_chat_message(uuid, text, text, text, text, bigint) from public, anon;

-- ============================================================
-- 5) Storage policies for portal attachments
-- ============================================================

create or replace function public.can_upload_verification_file(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
declare
  _request_id uuid;
  head text;
begin
  if auth.uid() is null then return false; end if;
  if not public.is_allowed_chat_file(_name) then return false; end if;
  head := (storage.foldername(_name))[1];
  if head is null or not head ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  _request_id := head::uuid;
  return public.can_participate_verification_chat(_request_id);
end;
$fn$;
grant execute on function public.can_upload_verification_file(text) to authenticated;
revoke all on function public.can_upload_verification_file(text) from public, anon;

create or replace function public.can_access_verification_file(_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
  select exists (
    select 1
    from public.verification_chat_messages vcm
    where vcm.attachment_url = _name
      and public.can_participate_verification_chat(vcm.request_id)
  );
$fn$;
grant execute on function public.can_access_verification_file(text) to authenticated;
revoke all on function public.can_access_verification_file(text) from public, anon;

-- INSERT policy for portal files.
drop policy if exists "verification chat members upload attachments" on storage.objects;
create policy "verification chat members upload attachments" on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and public.can_upload_verification_file(name)
  );

-- SELECT policy for portal files (OR'd with existing chat member policy).
drop policy if exists "verification chat members read attachments" on storage.objects;
create policy "verification chat members read attachments" on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and public.can_access_verification_file(name)
  );

-- DELETE policy for portal files (same gate as upload).
drop policy if exists "verification chat members delete attachments" on storage.objects;
create policy "verification chat members delete attachments" on storage.objects
  for delete using (
    bucket_id = 'chat-attachments'
    and public.can_upload_verification_file(name)
  );

-- ============================================================
-- 6) Update resolve_verification_request to close the portal
-- ============================================================

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

  -- Close the temporary verification portal chat (cascades to messages).
  DELETE FROM public.verification_chats WHERE request_id = _request_id;
END;
$$;

-- ============================================================
-- 7) Realtime publication for portal messages
-- ============================================================

do $$
declare
  _pub_oid oid;
  _exists boolean;
begin
  select oid into _pub_oid from pg_publication where pubname = 'supabase_realtime';
  if _pub_oid is not null then
    select exists (
      select 1 from pg_publication_rel
      where prpubid = _pub_oid
        and prrelid = 'public.verification_chat_messages'::regclass
    ) into _exists;
    if not _exists then
      alter publication supabase_realtime add table public.verification_chat_messages;
    end if;
  end if;
end $$;

-- Revoke anonymous access to portal tables.
revoke all on public.verification_chats from anon;
revoke all on public.verification_chat_messages from anon;
