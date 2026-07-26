-- SurpriseMeCard: one curated "stretch" experience per member per week.
create table public.surprise_me_cards (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  week_start_date date not null,
  activity_id uuid not null references public.activities (id) on delete restrict,
  member_response text check (member_response in ('accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (member_id, week_start_date)
);

create index surprise_me_cards_member_id_idx on public.surprise_me_cards (member_id);

alter table public.surprise_me_cards enable row level security;

create policy "surprise me owner or admin select"
  on public.surprise_me_cards for select
  using (member_id = auth.uid() or public.is_admin());

create policy "surprise me owner respond"
  on public.surprise_me_cards for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "surprise me admin write"
  on public.surprise_me_cards for all
  using (public.is_admin())
  with check (public.is_admin());
