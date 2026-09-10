-- Campus highlights: a staff-managed banner promoting current college events.

create table public.college_highlights (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(both from title)) between 3 and 120),
  description text check (description is null or char_length(trim(both from description)) between 3 and 500),
  link_url text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  emoji text not null default '⭐' check (char_length(emoji) <= 8),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index college_highlights_active_idx
  on public.college_highlights (is_active, starts_at, ends_at);

alter table public.college_highlights enable row level security;

-- Anyone may read active highlights (visitors included); only staff may write.
create policy "active highlights are public" on public.college_highlights
  for select using (is_active and (ends_at is null or ends_at > now()));

create policy "staff manage highlights" on public.college_highlights
  for all
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

create or replace function public.touch_highlight_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_touch_highlight_updated_at on public.college_highlights;
create trigger trg_touch_highlight_updated_at
  before update on public.college_highlights
  for each row execute function public.touch_highlight_updated_at();

-- Seed a couple of evergreen examples so the feed banner renders immediately.
insert into public.college_highlights (title, description, link_url, emoji, is_active, starts_at, ends_at)
values
  ('International Culture Week', 'Celebrating diversity on campus — food, music, dance and more across venues all week.', null, '🌍', true, now(), now() + interval '10 days'),
  ('Semester 1 Exams', 'Stay on track with the exam timetable and library extended hours for the upcoming session.', null, '📚', true, now(), now() + interval '21 days')
on conflict do nothing;