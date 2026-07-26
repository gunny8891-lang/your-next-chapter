-- service_role bypasses RLS but still needs base table GRANTs, which weren't
-- applied automatically for tables created via the SQL Editor (same root cause
-- as the authenticated/anon grants in 20260101000007).

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
