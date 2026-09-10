-- Open chat to all signed-in members, add reply threading + edit metadata to
-- messages, and introduce a notifications system with triggers.
--
-- 1) Chat for everyone:
--    - messages INSERT policy: membership only (no verification requirement).
--    - ensure_direct_conversation: no verified checks on either side.
-- 2) messages: parent_id (reply threading) and edited_at (edit marker).
-- 3) notifications table + RLS + realtime + helper + triggers for
--    comments/replies on posts, activity joins ("ticket claims"),
--    verification request lifecycle, and new campus highlights ("ads").

-- ============================================================
-- 1) Open direct messaging to all members
-- ============================================================
drop policy if exists "verified students can send direct messages" on public.messages;
drop policy if exists "member can send messages to direct conversations" on public.messages;
drop policy if exists "members send direct messages" on public.messages;
create policy "member can send messages to direct conversations" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create or replace function public.ensure_direct_conversation(_peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  conversation_id uuid;
begin
  if _peer_id is null or _peer_id = auth.uid() then
    raise exception 'invalid_direct_recipient';
  end if;

  select c.id into existing_id
  from public.conversations c
  where c.participant_a = least(auth.uid(), _peer_id)
    and c.participant_b = greatest(auth.uid(), _peer_id)
  limit 1;
  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations (participant_a, participant_b)
  values (least(auth.uid(), _peer_id), greatest(auth.uid(), _peer_id))
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, auth.uid()), (conversation_id, _peer_id);

  return conversation_id;
end;
$$;
grant execute on function public.ensure_direct_conversation(uuid) to authenticated;
revoke all on function public.ensure_direct_conversation(uuid) from public, anon;

-- ============================================================
-- 2) messages: reply threading + edit marker
-- ============================================================
alter table public.messages
  add column if not exists parent_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz;

create index if not exists messages_parent_idx on public.messages (parent_id);

-- ============================================================
-- 3) notifications
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('comment','reply','ticket_claim','verification_status','highlight','admin')),
  entity_type text not null check (entity_type in ('post','activity','message','verification_request','highlight','system')),
  entity_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create policy "users read own notifications" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "users update own notifications" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Insert helper: only callable from SECURITY DEFINER triggers (bypasses RLS).
create or replace function public.notify_user(
  _user_id uuid,
  _type text,
  _entity_type text,
  _entity_id uuid default null,
  _actor_id uuid default null,
  _message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, entity_type, entity_id, actor_id, message)
  values (_user_id, _type, _entity_type, _entity_id, _actor_id, _message);
end;
$$;
revoke all on function public.notify_user(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;

-- 3a) Post comments + replies -> notify post author and (for replies) the
--     parent comment author. Demo posts are ignored.
create or replace function public.notify_on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  select p.author_user_id into post_author
  from public.posts p
  where p.id = new.post_id and p.is_demo = false;

  if post_author is not null and post_author <> new.author_user_id then
    perform public.notify_user(
      post_author, 'comment', 'post', new.post_id, new.author_user_id
    );
  end if;

  if new.parent_id is not null then
    select c.author_user_id into parent_author
    from public.comments c
    where c.id = new.parent_id;

    if parent_author is not null and parent_author <> new.author_user_id then
      perform public.notify_user(
        parent_author, 'reply', 'post', new.post_id, new.author_user_id
      );
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.notify_on_comment_insert() from public, anon, authenticated;

drop trigger if exists trg_notify_comment_insert on public.comments;
create trigger trg_notify_comment_insert
  after insert on public.comments
  for each row execute function public.notify_on_comment_insert();

-- 3b) Activity joins ("ticket claims") -> notify the activity creator.
create or replace function public.notify_on_activity_response_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_owner uuid;
begin
  select a.creator_user_id into activity_owner
  from public.activities a
  where a.id = new.activity_id and a.is_demo = false;

  if activity_owner is not null and activity_owner <> new.user_id then
    perform public.notify_user(
      activity_owner, 'ticket_claim', 'activity', new.activity_id, new.user_id
    );
  end if;

  return new;
end;
$$;
revoke all on function public.notify_on_activity_response_insert() from public, anon, authenticated;

drop trigger if exists trg_notify_activity_response_insert on public.activity_responses;
create trigger trg_notify_activity_response_insert
  after insert on public.activity_responses
  for each row execute function public.notify_on_activity_response_insert();

-- 3c) Verification requests -> new request announces moderators; status
--     changes inform the requester.
create or replace function public.notify_on_verification_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mod_user record;
  notif_message text;
begin
  if tg_op = 'INSERT' and new.status = 'open' then
    for mod_user in
      select ur.user_id
      from public.user_roles ur
      where ur.role in ('admin', 'moderator')
    loop
      perform public.notify_user(
        mod_user.user_id, 'admin', 'verification_request', new.id, new.user_id,
        'New verification request submitted'
      );
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    notif_message := case new.status
      when 'claimed'  then 'A moderator has claimed your verification request'
      when 'approved' then 'Your verification has been approved!'
      when 'rejected' then 'Your verification request was rejected'
      else null
    end;
    if notif_message is not null then
      perform public.notify_user(
        new.user_id, 'verification_status', 'verification_request', new.id, null, notif_message
      );
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.notify_on_verification_request() from public, anon, authenticated;

drop trigger if exists trg_notify_verification_request on public.verification_requests;
create trigger trg_notify_verification_request
  after insert or update on public.verification_requests
  for each row execute function public.notify_on_verification_request();

-- 3d) New active campus highlight ("ad") -> broadcast to every member.
create or replace function public.notify_on_highlight_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_record record;
begin
  if new.is_active then
    for user_record in
      select pr.id from public.profiles pr
    loop
      if user_record.id is distinct from new.created_by then
        perform public.notify_user(
          user_record.id, 'highlight', 'highlight', new.id, new.created_by, new.title
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_on_highlight_insert() from public, anon, authenticated;

drop trigger if exists trg_notify_highlight_insert on public.college_highlights;
create trigger trg_notify_highlight_insert
  after insert on public.college_highlights
  for each row execute function public.notify_on_highlight_insert();

-- ============================================================
-- 4) Realtime: publish notifications
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;