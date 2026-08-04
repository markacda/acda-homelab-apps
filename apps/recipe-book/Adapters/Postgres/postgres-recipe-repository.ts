import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { Recipe } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeData } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeRepository } from '../../Domain/Ports/Repositories/recipe-repository.ts';
import { withTransaction } from './tx.ts';

// RecipeRepository over the normalized schema (issue #166): the scalar fields
// live on the `recipes` row, the category is a real FK (its name resolved via a
// join / find-or-create), and the ordered collections live in child tables
// keyed by (recipe_id, order_index). The aggregate's RecipeData shape is
// reconstructed on read and written back column-by-column on save, so the domain
// and HTTP/JSON surface are unchanged.

interface RecipeRow {
  id: string;
  title: string;
  source_url: string | null;
  image_url: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

const RECIPE_COLUMNS = `r.id, r.title, r.source_url, r.image_url, r.servings, r.prep_time,
  r.cook_time, r.total_time, c.name AS category, r.created_at, r.updated_at`;

function iso(value: Date): string {
  return value.toISOString();
}

/** The child collections for one or more recipes, grouped by recipe id in order. */
async function loadChildren(
  pool: Pool,
  where: string,
  params: unknown[]
): Promise<{
  ingredients: Map<string, string[]>;
  steps: Map<string, string[]>;
  notes: Map<string, string[]>;
  images: Map<string, string[]>;
}> {
  const group = (rows: { recipe_id: string; value: string }[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.recipe_id) ?? [];
      list.push(row.value);
      map.set(row.recipe_id, list);
    }
    return map;
  };
  const load = async (table: string, valueColumn: string): Promise<Map<string, string[]>> => {
    const res = await pool.query<{ recipe_id: string; value: string }>(
      `SELECT recipe_id, ${valueColumn} AS value FROM ${table} ${where} ORDER BY recipe_id, order_index`,
      params
    );
    return group(res.rows);
  };
  return {
    ingredients: await load('recipe_ingredients', 'text'),
    steps: await load('recipe_steps', 'text'),
    notes: await load('recipe_notes', 'text'),
    images: await load('recipe_images', 'filename'),
  };
}

function toRecipeData(
  row: RecipeRow,
  children: { ingredients: Map<string, string[]>; steps: Map<string, string[]>; notes: Map<string, string[]>; images: Map<string, string[]> }
): RecipeData {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    title: row.title,
    imageUrl: row.image_url,
    images: children.images.get(row.id) ?? [],
    ingredients: children.ingredients.get(row.id) ?? [],
    steps: children.steps.get(row.id) ?? [],
    servings: row.servings ?? undefined,
    prepTime: row.prep_time ?? undefined,
    cookTime: row.cook_time ?? undefined,
    totalTime: row.total_time ?? undefined,
    notes: children.notes.get(row.id) ?? [],
    category: row.category ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Replace an ordered child collection with `values` renumbered 1..n. */
async function replaceOrdered(client: PoolClient, table: string, valueColumn: string, recipeId: string, values: string[]): Promise<void> {
  await client.query(`DELETE FROM ${table} WHERE recipe_id = $1`, [recipeId]);
  if (values.length === 0) return;
  const orders = values.map((_, i) => i + 1);
  await client.query(
    `INSERT INTO ${table} (recipe_id, order_index, ${valueColumn})
       SELECT $1, ord, val FROM unnest($2::int[], $3::text[]) AS t(ord, val)`,
    [recipeId, orders, values]
  );
}

export class PostgresRecipeRepository implements RecipeRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<Recipe[]> {
    const rows = await this.pool.query<RecipeRow>(
      `SELECT ${RECIPE_COLUMNS} FROM recipes r
         LEFT JOIN categories c ON c.id = r.category_id
        ORDER BY r.updated_at DESC`
    );
    const children = await loadChildren(this.pool, '', []);
    return rows.rows.map((row) => Recipe.fromJSON(toRecipeData(row, children)));
  }

  async get(id: string): Promise<Recipe | null> {
    const rows = await this.pool.query<RecipeRow>(
      `SELECT ${RECIPE_COLUMNS} FROM recipes r
         LEFT JOIN categories c ON c.id = r.category_id
        WHERE r.id = $1`,
      [id]
    );
    const row = rows.rows[0];
    if (!row) return null;
    const children = await loadChildren(this.pool, 'WHERE recipe_id = $1', [id]);
    return Recipe.fromJSON(toRecipeData(row, children));
  }

  async save(recipe: Recipe): Promise<void> {
    const data = recipe.toJSON();
    await withTransaction(this.pool, async (client) => {
      const categoryId = await resolveCategoryId(client, data.category);
      await client.query(
        `INSERT INTO recipes
           (id, title, source_url, image_url, servings, prep_time, cook_time, total_time, category_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, source_url = EXCLUDED.source_url, image_url = EXCLUDED.image_url,
           servings = EXCLUDED.servings, prep_time = EXCLUDED.prep_time, cook_time = EXCLUDED.cook_time,
           total_time = EXCLUDED.total_time, category_id = EXCLUDED.category_id, updated_at = EXCLUDED.updated_at`,
        [
          data.id,
          data.title,
          data.sourceUrl,
          data.imageUrl,
          data.servings ?? null,
          data.prepTime ?? null,
          data.cookTime ?? null,
          data.totalTime ?? null,
          categoryId,
          data.createdAt,
          data.updatedAt,
        ]
      );
      await replaceOrdered(client, 'recipe_ingredients', 'text', data.id, data.ingredients);
      await replaceOrdered(client, 'recipe_steps', 'text', data.id, data.steps);
      await replaceOrdered(client, 'recipe_notes', 'text', data.id, data.notes);
      await replaceOrdered(client, 'recipe_images', 'filename', data.id, data.images);
    });
  }

  async delete(id: string): Promise<void> {
    // Child rows (ingredients/steps/notes/images) cascade via their FKs.
    await this.pool.query('DELETE FROM recipes WHERE id = $1', [id]);
  }
}

/**
 * Map a recipe's category *name* to a category id, creating the managed category
 * on the fly when it doesn't exist yet. This keeps the FK valid while preserving
 * free-text category entry (manual edits and Allerhande imports both set a name).
 */
async function resolveCategoryId(client: PoolClient, name: string | undefined): Promise<string | null> {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;
  const found = await client.query<{ id: string }>('SELECT id FROM categories WHERE name = $1 ORDER BY id LIMIT 1', [trimmed]);
  if (found.rows[0]) return found.rows[0].id;
  const id = randomUUID();
  const ts = new Date().toISOString();
  await client.query('INSERT INTO categories (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)', [id, trimmed, ts]);
  return id;
}
