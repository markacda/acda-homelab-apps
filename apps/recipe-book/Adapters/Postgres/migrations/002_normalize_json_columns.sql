-- Normalize the recipe-book aggregates out of the single `data` jsonb blob into
-- real relational columns + child tables (issue #166). The whole file runs in
-- one transaction (the migration runner wraps each file in BEGIN/COMMIT), so the
-- create -> backfill -> drop sequence is atomic: no half-migrated state, no data
-- loss. Ordered arrays become child tables with a 1-based `order_index` (1 is
-- first, n is last). Recipes reference categories by a real foreign key.
-- Runs in the `recipe_book` schema (the role's search_path).

------------------------------------------------------------------------------
-- A. New columns and tables (kept nullable for now so the backfill can run).
------------------------------------------------------------------------------

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS name       text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS name       text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS title       text,
  ADD COLUMN IF NOT EXISTS source_url  text,
  ADD COLUMN IF NOT EXISTS image_url   text,
  ADD COLUMN IF NOT EXISTS servings    text,
  ADD COLUMN IF NOT EXISTS prep_time   text,
  ADD COLUMN IF NOT EXISTS cook_time   text,
  ADD COLUMN IF NOT EXISTS total_time  text,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz,
  ADD COLUMN IF NOT EXISTS category_id text REFERENCES categories (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id   text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  order_index int  NOT NULL,
  text        text NOT NULL,
  PRIMARY KEY (recipe_id, order_index)
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  recipe_id   text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  order_index int  NOT NULL,
  text        text NOT NULL,
  PRIMARY KEY (recipe_id, order_index)
);

CREATE TABLE IF NOT EXISTS recipe_notes (
  recipe_id   text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  order_index int  NOT NULL,
  text        text NOT NULL,
  PRIMARY KEY (recipe_id, order_index)
);

-- order_index 1 is the title image; 2..n are the gallery photos.
CREATE TABLE IF NOT EXISTS recipe_images (
  recipe_id   text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  order_index int  NOT NULL,
  filename    text NOT NULL,
  PRIMARY KEY (recipe_id, order_index)
);

-- order_index 1..n is the page order within the book.
CREATE TABLE IF NOT EXISTS book_recipes (
  book_id     text NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  recipe_id   text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  order_index int  NOT NULL,
  PRIMARY KEY (book_id, order_index),
  UNIQUE (book_id, recipe_id)
);

------------------------------------------------------------------------------
-- B. Backfill from the existing `data` jsonb (before dropping it).
------------------------------------------------------------------------------

-- Scalar fields. created_at is COALESCEd defensively so a legacy row missing the
-- key still satisfies the NOT NULL added in step C.
UPDATE categories SET
  name       = data ->> 'name',
  created_at = COALESCE((data ->> 'createdAt')::timestamptz, now());

UPDATE books SET
  name       = data ->> 'name',
  created_at = COALESCE((data ->> 'createdAt')::timestamptz, now());

UPDATE recipes SET
  title      = data ->> 'title',
  source_url = data ->> 'sourceUrl',
  image_url  = data ->> 'imageUrl',
  servings   = data ->> 'servings',
  prep_time  = data ->> 'prepTime',
  cook_time  = data ->> 'cookTime',
  total_time = data ->> 'totalTime',
  created_at = COALESCE((data ->> 'createdAt')::timestamptz, now());

-- Ordered child collections (index is 1-based via WITH ORDINALITY).
INSERT INTO recipe_ingredients (recipe_id, order_index, text)
SELECT r.id, e.ord, e.value
FROM recipes r,
     jsonb_array_elements_text(r.data -> 'ingredients') WITH ORDINALITY AS e(value, ord);

INSERT INTO recipe_steps (recipe_id, order_index, text)
SELECT r.id, e.ord, e.value
FROM recipes r,
     jsonb_array_elements_text(r.data -> 'steps') WITH ORDINALITY AS e(value, ord);

INSERT INTO recipe_notes (recipe_id, order_index, text)
SELECT r.id, e.ord, e.value
FROM recipes r,
     jsonb_array_elements_text(r.data -> 'notes') WITH ORDINALITY AS e(value, ord);

INSERT INTO recipe_images (recipe_id, order_index, filename)
SELECT r.id, e.ord, e.value
FROM recipes r,
     jsonb_array_elements_text(r.data -> 'images') WITH ORDINALITY AS e(value, ord);

-- Categories are now a real FK. Recipes previously stored a category *name*, so
-- create a managed category for any recipe category name not already present,
-- then link every recipe to its category by name.
INSERT INTO categories (id, name, created_at, updated_at)
SELECT gen_random_uuid()::text, missing.name, now(), now()
FROM (
  SELECT DISTINCT nullif(r.data ->> 'category', '') AS name
  FROM recipes r
  WHERE nullif(r.data ->> 'category', '') IS NOT NULL
) AS missing
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = missing.name);

-- Match by name, picking a single (min id) category when duplicate names exist.
UPDATE recipes r SET category_id = m.id
FROM (SELECT name, min(id) AS id FROM categories GROUP BY name) AS m
WHERE m.name = nullif(r.data ->> 'category', '');

-- Book -> recipe page order. Keep only ids that still exist (today's read-side
-- tolerated stale ids), and re-number so order_index is contiguous 1..n.
INSERT INTO book_recipes (book_id, recipe_id, order_index)
SELECT link.book_id, link.recipe_id,
       row_number() OVER (PARTITION BY link.book_id ORDER BY link.ord)
FROM (
  SELECT b.id AS book_id, e.value AS recipe_id, e.ord
  FROM books b,
       jsonb_array_elements_text(b.data -> 'recipeIds') WITH ORDINALITY AS e(value, ord)
  WHERE EXISTS (SELECT 1 FROM recipes r WHERE r.id = e.value)
) AS link;

------------------------------------------------------------------------------
-- C. Enforce NOT NULL now that data is backfilled, then drop the json blobs.
------------------------------------------------------------------------------

ALTER TABLE categories
  ALTER COLUMN name       SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE books
  ALTER COLUMN name       SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE recipes
  ALTER COLUMN title      SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE recipes    DROP COLUMN data;
ALTER TABLE books      DROP COLUMN data;
ALTER TABLE categories DROP COLUMN data;
