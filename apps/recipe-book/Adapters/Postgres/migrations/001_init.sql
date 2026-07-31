-- Recipe-book structured data, one JSONB row per aggregate. Image bytes and
-- generated PDFs stay on the data volume; only recipes/books/categories move
-- here. Runs in the `recipe_book` schema (the role's search_path).
CREATE TABLE IF NOT EXISTS recipes (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS recipes_updated_at_idx ON recipes (updated_at DESC);

CREATE TABLE IF NOT EXISTS books (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS books_updated_at_idx ON books (updated_at DESC);

CREATE TABLE IF NOT EXISTS categories (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS categories_updated_at_idx ON categories (updated_at DESC);
