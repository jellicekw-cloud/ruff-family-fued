-- Ruff Family Feud: one-time setup
-- Supabase → SQL Editor → New query → paste all of this → Run.
-- Safe to run again; it won't erase anything.

create table if not exists public.feud_questions (
  id          uuid primary key default gen_random_uuid(),
  position    int  not null default 0,
  section     text not null default 'main',      -- main | finale | fast
  prompt      text not null,
  kind        text not null default 'open',      -- open | vote
  max_answers int  not null default 2,
  options     jsonb not null default '[]'::jsonb, -- choices for a vote question
  answers     jsonb not null default '[]'::jsonb, -- placeholder board: [{"text":..,"points":..}]
  decoys      jsonb not null default '[]'::jsonb, -- fake answers shown on phones
  use_survey  boolean not null default true,
  merges      jsonb not null default '{}'::jsonb, -- survey answer grouping
  labels      jsonb not null default '{}'::jsonb, -- renamed survey groups
  created_at  timestamptz not null default now()
);

create table if not exists public.feud_responses (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.feud_questions(id) on delete cascade,
  respondent  text not null,
  answers     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.feud_state (
  room        text primary key,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.feud_questions enable row level security;
alter table public.feud_responses enable row level security;
alter table public.feud_state     enable row level security;

drop policy if exists "feud questions open" on public.feud_questions;
drop policy if exists "feud responses open" on public.feud_responses;
drop policy if exists "feud state open"     on public.feud_state;

create policy "feud questions open" on public.feud_questions for all to anon, authenticated using (true) with check (true);
create policy "feud responses open" on public.feud_responses for all to anon, authenticated using (true) with check (true);
create policy "feud state open"     on public.feud_state     for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.feud_questions to anon, authenticated;
grant select, insert, update, delete on public.feud_responses to anon, authenticated;
grant select, insert, update, delete on public.feud_state     to anon, authenticated;
