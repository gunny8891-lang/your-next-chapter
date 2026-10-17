-- Dates to remember: birthdays, anniversaries, a day to remember, anything a member wants not to forget.
-- Held as a month and a day (with a year only if the member gives one, for "turning 70" or "40th anniversary"), so a date
-- comes round every year without being entered again. Private to the member: nobody else can read it, and it goes with the
-- account if it is deleted.
create table public.important_dates (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null default 'other' check (kind in ('birthday', 'anniversary', 'remembrance', 'other')),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  year smallint check (year is null or year between 1900 and 2100),
  created_at timestamptz not null default now()
);

create index important_dates_member_id_idx on public.important_dates (member_id);

alter table public.important_dates enable row level security;

create policy "important dates owner select"
  on public.important_dates for select
  using (member_id = auth.uid());

create policy "important dates owner insert"
  on public.important_dates for insert
  with check (member_id = auth.uid());

create policy "important dates owner update"
  on public.important_dates for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "important dates owner delete"
  on public.important_dates for delete
  using (member_id = auth.uid());

-- Explicit grants: a blanket grant in an earlier migration only covers tables that existed when it ran.
grant select, insert, update, delete on public.important_dates to authenticated;
grant all on public.important_dates to service_role;
