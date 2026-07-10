import type { Recipe } from '../../Domain/Aggregates/recipe.ts';
import type { RecipeSource } from '../../Ports/Allerhande/recipe-source.ts';
import { RecipeService } from './recipe-service.ts';
import { DomainError } from '../../Domain/Exceptions/domain-error.ts';

/**
 * Orchestrates importing a recipe from an external URL: fetch + parse via the
 * RecipeSource port, then create it through the RecipeService. Maps the source's
 * failure modes to HTTP-meaningful errors — an unfetchable page to 502, a page
 * with no parseable recipe to 422.
 */
export class RecipeImportService {
  private source: RecipeSource;
  private recipes: RecipeService;

  constructor(source: RecipeSource, recipes: RecipeService) {
    this.source = source;
    this.recipes = recipes;
  }

  async import(url: string): Promise<Recipe> {
    let parsed;
    try {
      parsed = await this.source.fetch(url);
    } catch (err) {
      throw new DomainError(err instanceof Error ? err.message : 'Import failed.', 502);
    }
    if (!parsed) {
      throw new DomainError('Could not find recipe data on that page. You can add the recipe manually instead.', 422);
    }
    return this.recipes.create({
      title: parsed.title,
      sourceUrl: url,
      imageUrl: parsed.imageUrl,
      ingredients: parsed.ingredients,
      steps: parsed.steps,
      servings: parsed.servings,
      prepTime: parsed.prepTime,
      cookTime: parsed.cookTime,
      totalTime: parsed.totalTime,
      notes: [],
      category: parsed.category,
    });
  }
}
