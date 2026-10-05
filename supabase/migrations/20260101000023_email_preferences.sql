-- Email preferences: a member can stop either kind of email we send, from the link in
-- the email itself or in Account.
--
-- Two separate choices, because they are two different things: the weekly plan is the
-- product arriving in the inbox, while a reminder is an occasional timely thought. Both
-- default to on (what members have been receiving), and turning one off never affects the
-- other or anything inside the app. The weekly plan is still built in the app either way;
-- only the email is skipped.
--
-- Account emails (confirming an address, resetting a password) are not optional and are
-- not covered here: they are sent by the sign-in provider because the member asked.
--
-- The existing member_profiles row policies already let a member change their own row, and
-- the table-level grants cover new columns, so nothing else is needed.

alter table public.member_profiles
  add column email_weekly_plan boolean not null default true,
  add column email_reminders boolean not null default true;
