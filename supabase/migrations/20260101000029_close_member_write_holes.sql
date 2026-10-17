-- A member could make themselves an administrator.
--
-- public.users held the grant "select, update ... to authenticated" with a policy letting a member update their own row, and
-- nothing limited which columns. So any signed-in member could, from a browser console, run
--   update users set role = 'admin' where id = <their own id>
-- and from then on read every member's data wherever a policy says "or is_admin()", write the catalogue, and change their own
-- email (which the reminder and digest jobs read). Nothing in the app updates this table as a member (it only reads it), so the
-- right fix is to take the write away altogether. The app changes a user's row only through the service role, which this does
-- not touch.
drop policy if exists "users update own" on public.users;
revoke update on public.users from authenticated;

-- family_links belongs to a feature that does not exist yet. As it stands, any member could write a link naming any other
-- account, and either side of a link could rewrite any of its columns. Nothing reads or writes it, so nothing is lost by closing
-- it until the feature is built (with column limits).
revoke insert, update, delete on public.family_links from authenticated;
