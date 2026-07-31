-- Recent-notifications feed. `seq` gives a stable newest-first ordering (the
-- JSON store relied on array position); the app caps the table at 200 rows.
-- Runs in the `notification` schema (the role's search_path).
CREATE TABLE IF NOT EXISTS notifications (
  seq        bigint GENERATED ALWAYS AS IDENTITY,
  id         text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  channels   text[],
  url        text,
  icon       text,
  receiver   text
);
