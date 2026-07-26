-- Itinerary: one per member per week.
create table public.itineraries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  week_start_date date not null,
  generated_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'sent', 'completed')),
  unique (member_id, week_start_date)
);

create index itineraries_member_id_idx on public.itineraries (member_id);

alter table public.itineraries enable row level security;

create policy "itineraries owner or admin select"
  on public.itineraries for select
  using (member_id = auth.uid() or public.is_admin());

create policy "itineraries admin write"
  on public.itineraries for all
  using (public.is_admin())
  with check (public.is_admin());

-- ItineraryItem: one activity slot within an itinerary.
create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete restrict,
  day_of_week text not null check (day_of_week in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  slot text not null check (slot in ('morning', 'afternoon', 'evening')),
  member_action text not null default 'pending' check (member_action in ('pending', 'accepted', 'swapped', 'skipped')),
  booked_confirmed boolean,
  rationale_text text
);

create index itinerary_items_itinerary_id_idx on public.itinerary_items (itinerary_id);
create index itinerary_items_activity_id_idx on public.itinerary_items (activity_id);

alter table public.itinerary_items enable row level security;

-- Ownership flows through the parent itinerary, not a direct member_id column.
create policy "itinerary items owner or admin select"
  on public.itinerary_items for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.itineraries i
      where i.id = itinerary_id and i.member_id = auth.uid()
    )
  );

-- Members may only update the fields that represent their own actions
-- (accept/swap/skip, booked confirmation) on their own itinerary items.
create policy "itinerary items owner action update"
  on public.itinerary_items for update
  using (
    exists (
      select 1 from public.itineraries i
      where i.id = itinerary_id and i.member_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.itineraries i
      where i.id = itinerary_id and i.member_id = auth.uid()
    )
  );

create policy "itinerary items admin write"
  on public.itinerary_items for all
  using (public.is_admin())
  with check (public.is_admin());
