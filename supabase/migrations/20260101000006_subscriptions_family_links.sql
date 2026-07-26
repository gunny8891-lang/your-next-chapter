-- Subscription: one Stripe-backed subscription per user.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  plan text not null check (plan in ('standard', 'family')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'cancelled', 'incomplete')),
  stripe_customer_id text,
  renewal_date date,
  created_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions owner or admin select"
  on public.subscriptions for select
  using (user_id = auth.uid() or public.is_admin());

-- Writes happen server-side (Stripe webhook handler) using the service role key,
-- which bypasses RLS entirely, so no member-facing insert/update policy is needed.
create policy "subscriptions admin write"
  on public.subscriptions for all
  using (public.is_admin())
  with check (public.is_admin());

-- FamilyLink (Phase 2): stubbed now so the data model supports it later.
-- Visibility must be strictly opt-in and granular per NFR in spec section 11.
create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  family_user_id uuid not null references public.users (id) on delete cascade,
  visibility_settings jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  unique (member_id, family_user_id)
);

create index family_links_member_id_idx on public.family_links (member_id);
create index family_links_family_user_id_idx on public.family_links (family_user_id);

alter table public.family_links enable row level security;

create policy "family links participant or admin select"
  on public.family_links for select
  using (member_id = auth.uid() or family_user_id = auth.uid() or public.is_admin());

create policy "family links member invite"
  on public.family_links for insert
  with check (member_id = auth.uid());

create policy "family links participant update"
  on public.family_links for update
  using (member_id = auth.uid() or family_user_id = auth.uid())
  with check (member_id = auth.uid() or family_user_id = auth.uid());
