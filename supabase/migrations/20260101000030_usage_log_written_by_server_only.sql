-- The record of AI use is what the daily cost limits are counted from, so a member must not be able to write to it.
--
-- A policy let any member insert a row for themselves with any feature and any cost. One row claiming a few dollars on the
-- search feature uses up the whole system-wide daily search budget, which then stops the nightly search, the organiser rereads
-- and every member's search for that day, and can be repeated each day. The app now writes every usage row with the service
-- role (the concierge and "I've got some time" used the member's own session), so the policy is no longer needed.
--
-- Apply this AFTER the app version that logs with the service role is live: until then the concierge's usage would not be
-- recorded, and the per-member limits count from that record.
drop policy if exists "ai usage logs own insert" on public.ai_usage_logs;
revoke insert on public.ai_usage_logs from authenticated;
