import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { Recipe } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeData } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeRepository } from '../../Domain/Ports/Repositories/recipe-repository.ts';
import { RECIPES_DIR } from './paths.ts';
import { ensureDir, readJson, writeJson, listIds } from './json-file.ts';

/** RecipeRepository backed by one JSON file per recipe under RECIPES_DIR. */
export class JsonRecipeRepository implements RecipeRepository {
  async list(): Promise<Recipe[]> {
    const ids = await listIds(RECIPES_DIR);
    const recipes = await Promise.all(ids.map((id) => this.get(id)));
    return recipes.filter((r): r is Recipe => r !== null).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async get(id: string): Promise<Recipe | null> {
    const data = await readJson<RecipeData>(join(RECIPES_DIR, `${id}.json`));
    return data ? Recipe.fromJSON(data) : null;
  }

  async save(recipe: Recipe): Promise<void> {
    await ensureDir(RECIPES_DIR);
    await writeJson(join(RECIPES_DIR, `${recipe.id}.json`), recipe.toJSON());
  }

  async delete(id: string): Promise<void> {
    await unlink(join(RECIPES_DIR, `${id}.json`)).catch(() => {});
  }
}
