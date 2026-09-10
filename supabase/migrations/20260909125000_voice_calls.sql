-- One-to-one voice calls between verified students.
-- Signaling rides on a per-call realtime broadcast channel whose name embeds a
-- random token held only by the participants (capability-style access).

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null default 'voice' check (call_type = 'voice'),
  status text not null default 'dialing'
    check (status in ('dialing', 'ringing', 'active', 'ended', 'missed', 'declined')),
  token text not null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (caller_id <> callee_id)
);

create index if not exists voice_calls_callee_status_idx on public.voice_calls (callee_id, status);
create index if not exists voice_calls_caller_status_idx on public.voice_calls (caller_id, status);

-- On create: the caller must be the current verified student, both
-- participants must belong to the conversation, and a fresh secret token is
-- minted for the signaling channel.
create or replace function public.validate_voice_call()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if new.caller_id is distinct from auth.uid() then
    raise exception 'not_your_call';
  end if;
  if not public.is_verified_student() then
    raise exception 'verification_required';
  end if;
  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id in (new.caller_id, new.callee_id)
    group by cm.conversation_id
    having count(distinct cm.user_id) = 2
  ) then
    raise exception 'invalid_call_participants';
  end if;
  new.token := encode(gen_random_bytes(12), 'hex');
  new.status := 'dialing';
  new.started_at := null;
  new.ended_at := null;
  return new;
end;
$fn$;

drop trigger if exists trg_validate_voice_call on public.voice_calls;
create trigger trg_validate_voice_call
  before insert on public.voice_calls
  for each row execute function public.validate_voice_call();

-- Participants and the token can never be altered after creation, and a
-- finished call cannot be reopened.
create or replace function public.guard_voice_call()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $fn$
begin
  if new.caller_id is distinct from old.caller_id
     or new.callee_id is distinct from old.callee_id
     or new.conversation_id is distinct from old.conversation_id
     or new.token is distinct from old.token then
    raise exception 'call_participants_are_read_only';
  end if;
  if new.status is distinct from old.status and old.status = 'ended' then
    raise exception 'call_already_ended';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_guard_voice_call on public.voice_calls;
create trigger trg_guard_voice_call
  before update on public.voice_calls
  for each row execute function public.guard_voice_call();

alter table public.voice_calls enable row level security;

drop policy if exists "participants see their calls" on public.voice_calls;
create policy "participants see their calls" on public.voice_calls
  for select using (auth.uid() in (caller_id, callee_id));

drop policy if exists "participants create calls" on public.voice_calls
  for insert with check (auth.uid() in (caller_id, callee_id));

drop policy if exists "participants update their calls" on public.voice_calls
  for update
  using (auth.uid() in (caller_id, callee_id))
  with check (auth.uid() in (caller_id, callee_id));

-- No delete policy: calls are terminal state machines.

-- New ringing calls are delivered in real time to the callee.
do $rt$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'voice_calls'
  ) then
    alter publication supabase_realtime add table public.voice_calls;
  end if;
end
$rt$;