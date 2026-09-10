-- Chat media: attachments (image/document), voice messages and their storage.

alter table public.messages add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'image', 'document', 'voice'));
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_size bigint;
alter table public.messages add column if not exists duration_ms integer;

drop constraint if exists messages_content_check;
alter table public.messages alter column content drop not null;

-- Text messages must carry non-empty content; media messages must reference a
-- valid chat-attachments object and carry no free text.
create or replace function public.is_allowed_chat_file(_name text)
returns boolean
language sql
immutable
as $fn$
  select _name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
     and _name ~* '\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|pptx?|txt|rtf|csv|ods|odt|mp3|m4a|oga|ogg|opus|wav|webm|mp4)$';
$fn$;

drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (message_type = 'text'
    and char_length(trim(both from content)) > 0
    and char_length(content) <= 500
    and attachment_url is null
    and attachment_name is null
    and attachment_type is null
    and attachment_size is null
    and duration_ms is null)
  or (message_type in ('image', 'document', 'voice')
    and content is null
    and attachment_url is not null
    and public.is_allowed_chat_file(attachment_url))
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- Private storage bucket for chat files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 26214400, null)
on conflict (id) do nothing;

-- True when the caller is a member of the conversation encoded in the object
-- path (conversation_id / random-file.ext) and is a verified student.
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
  if not public.is_verified_student() then return false; end if;
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

-- True when the caller belongs to the conversation in the object path.
create or replace function public.chat_attachments_folder_member(_name text)
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

-- True when the object is referenced by a message in a conversation the caller
-- belongs to.
create or replace function public.can_access_chat_attachment(_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
  select exists (
    select 1
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id
     and cm.user_id = auth.uid()
    where m.attachment_url = _name
  );
$fn$;

drop policy if exists "verified members upload chat attachments" on storage.objects;
create policy "verified members upload chat attachments" on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and public.can_upload_chat_attachment(name)
  );

drop policy if exists "chat members read chat attachments" on storage.objects;
create policy "chat members read chat attachments" on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and public.can_access_chat_attachment(name)
  );

drop policy if exists "chat members delete chat attachments" on storage.objects;
create policy "chat members delete chat attachments" on storage.objects
  for delete using (
    bucket_id = 'chat-attachments'
    and public.chat_attachments_folder_member(name)
  );