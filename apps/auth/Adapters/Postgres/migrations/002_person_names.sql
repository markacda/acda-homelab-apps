-- Add the required first/last name to a person (issue #187). Runs in the `auth`
-- schema (the role's search_path), so tables are unqualified.
--
-- The columns are NOT NULL with an empty-string default rather than backfilled:
-- accounts created before this migration never supplied a name and guessing one from
-- the email would invent data. They read back blank and their owner completes them on
-- the /auth account page, which requires both names to save.
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name  text NOT NULL DEFAULT '';
