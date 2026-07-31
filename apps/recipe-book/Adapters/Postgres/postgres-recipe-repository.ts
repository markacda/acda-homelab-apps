import type { Pool } from 'pg';
import { Recipe } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeData } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeRepository } from '../../Domain/Ports/Repositories/recipe-repository.ts';
import { listJson, getJson, upsertJson, deleteJson } from './jsonb-store.ts';

/** RecipeRepository backed by one JSONB row per recipe in the `recipes` table. */
export class PostgresRecipeRepository implements RecipeRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(): Promise<Recipe[]> {
    return (await listJson<RecipeData>(this.pool, 'recipes')).map((d) => Recipe.fromJSON(d));
  }

  async get(id: string): Promise<Recipe | null> {
    const data = await getJson<RecipeData>(this.pool, 'recipes', id);
    return data ? Recipe.fromJSON(data) : null;
  }

  async save(recipe: Recipe): Promise<void> {
    await upsertJson(this.pool, 'recipes', recipe.toJSON());
  }

  async delete(id: string): Promise<void> {
    await deleteJson(this.pool, 'recipes', id);
  }
}
