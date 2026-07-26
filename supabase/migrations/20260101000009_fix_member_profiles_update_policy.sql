-- The original member_profiles migration's UPDATE policy silently never applied
-- (same partial-run issue as the earlier partners/activities migration) — found via
-- live testing of the Account/Settings save flow, which affected 0 rows with no error.
create policy "member profile owner update"
  on public.member_profiles for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
