-- MemberProfile: 1:1 with User where role = 'member'.
create table public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  location_text text,
  location_lat double precision,
  location_lng double precision,
  travel_radius_km numeric,
  drives boolean,
  uses_public_transport boolean,
  mobility_notes text,
  dietary_preferences text,
  personality jsonb not null default '{}'::jsonb, -- group_size_pref, pace_pref, time_of_day_pref, spontaneity_score
  interests text[] not null default '{}',
  goals text[] not null default '{}',
  budget_band text check (budget_band in ('low', 'medium', 'high')),
  onboarding_transcript jsonb,
  updated_at timestamptz not null default now()
);

create index member_profiles_user_id_idx on public.member_profiles (user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger member_profiles_set_updated_at
  before update on public.member_profiles
  for each row execute function public.set_updated_at();

alter table public.member_profiles enable row level security;

create policy "member profile owner or admin select"
  on public.member_profiles for select
  using (user_id = auth.uid() or public.is_admin());

create policy "member profile owner insert"
  on public.member_profiles for insert
  with check (user_id = auth.uid());

create policy "member profile owner update"
  on public.member_profiles for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
