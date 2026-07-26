-- User: mirrors auth.users with app-level role/status, one row per auth user.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  auth_provider text not null default 'email',
  role text not null default 'member' check (role in ('member', 'family', 'admin', 'partner')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- Used by RLS policies across other tables to grant admins full access.
create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

create policy "users select own or admin"
  on public.users for select
  using (id = auth.uid() or public.is_admin());

create policy "users update own"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, auth_provider)
  values (
    new.id,
    new.email,
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
