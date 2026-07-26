-- Partner (Phase 2 stub, table exists now so Activity can reference it).
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  category text,
  contact_info jsonb not null default '{}'::jsonb,
  commission_rate numeric,
  listing_status text not null default 'pending' check (listing_status in ('pending', 'active', 'inactive')),
  created_at timestamptz not null default now()
);

alter table public.partners enable row level security;

create policy "partners admin all"
  on public.partners for all
  using (public.is_admin())
  with check (public.is_admin());

-- Activity: an instance of something bookable (event, class, venue offer).
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (category in ('Move', 'Connect', 'Learn', 'Explore', 'Give Back', 'Wellness', 'Joy')),
  provider_id uuid references public.partners (id) on delete set null,
  address text,
  location_lat double precision,
  location_lng double precision,
  date_time timestamptz,
  recurrence_rule text,
  duration_minutes integer,
  price_estimate numeric,
  booking_url text,
  source text not null default 'manual' check (source in ('manual', 'discovery_agent', 'partner_feed')),
  tags text[] not null default '{}',
  accessibility_notes text,
  rating numeric,
  status text not null default 'active' check (status in ('active', 'expired', 'removed')),
  created_at timestamptz not null default now()
);

create index activities_status_idx on public.activities (status);
create index activities_category_idx on public.activities (category);
create index activities_tags_idx on public.activities using gin (tags);
create index activities_location_idx on public.activities (location_lat, location_lng);

alter table public.activities enable row level security;

-- Activities are the shared catalog every member browses; only admins/backend jobs write to it.
create policy "activities public read active"
  on public.activities for select
  using (status = 'active' or public.is_admin());

create policy "activities admin write"
  on public.activities for all
  using (public.is_admin())
  with check (public.is_admin());
