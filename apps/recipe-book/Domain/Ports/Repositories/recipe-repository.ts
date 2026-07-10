import type { Recipe } from '../../Aggregates/recipe.ts';

/** Persistence port for the Recipe aggregate. Implemented in the Adapters layer. */
export interface RecipeRepository {
  /** All recipes, newest-updated first. */
  list(): Promise<Recipe[]>;
  get(id: string): Promise<Recipe | null>;
  save(recipe: Recipe): Promise<void>;
  delete(id: string): Promise<void>;
}
