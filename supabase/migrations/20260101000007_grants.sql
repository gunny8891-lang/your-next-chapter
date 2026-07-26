-- RLS policies only filter rows; Postgres also requires the underlying table-level
-- GRANTs before a role can touch a table at all. These weren't applied automatically
-- because the migrations ran as `postgres` via the SQL Editor rather than through
-- the dashboard's table editor (which sets up default privileges).

grant usage on schema public to authenticated, anon;

grant select, update on public.users to authenticated;

grant select, insert, update on public.member_profiles to authenticated;

grant select, insert, update, delete on public.partners to authenticated;

grant select, insert, update, delete on public.activities to authenticated;
grant select on public.activities to anon;

-- Append-only by design: no update/delete grant, matching the RLS policies.
grant select, insert on public.preference_signals to authenticated;

grant select, insert, update, delete on public.itineraries to authenticated;
grant select, insert, update, delete on public.itinerary_items to authenticated;
grant select, insert, update, delete on public.surprise_me_cards to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.family_links to authenticated;
