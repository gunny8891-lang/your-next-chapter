-- A photograph of a place, for the picture at the top of its card.
--
-- Photographs come from Wikimedia Commons (free licences only; see
-- src/lib/imagery/commons.ts) and are chosen for named venues, never for events
-- or groups. image_credit, image_license and image_source_url are what the app
-- must show with the picture, so they are stored with it, not looked up later.
--
-- image_checked_at records that we have looked, whether or not we found
-- anything, so a place with no photograph is not searched for again every night.
-- It is retried after about six weeks. A failed lookup (the service being busy)
-- leaves it null so it is tried again soon.
--
-- All columns are nullable and the app treats "no image" as the normal case, so
-- this migration changes nothing for existing rows or for any existing query.
alter table public.activities
  add column image_url text,
  add column image_alt text,
  add column image_credit text,
  add column image_license text,
  add column image_source_url text,
  add column image_checked_at timestamptz;

-- Only an https address on Wikimedia's image host can be stored: the card renders
-- it, and next.config.ts allows exactly that host.
alter table public.activities
  add constraint activities_image_url_wikimedia
  check (image_url is null or image_url like 'https://upload.wikimedia.org/%');

-- "Which places have not been looked at yet?" — the nightly job's question.
create index activities_image_checked_idx
  on public.activities (image_checked_at nulls first)
  where image_url is null;
