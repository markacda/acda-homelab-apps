import type { RecipeContent } from '../../Domain/Aggregates/recipe.ts'

// Wire shapes accepted by the recipe endpoints. The controllers hand raw bodies
// to the Application/Mappers, which validate and coerce them into the domain
// RecipeContent; these types document the contract other apps could depend on.

/** Body of POST /api/recipes (manual create). */
export type CreateRecipeRequest = RecipeContent

/** Body of PATCH /api/recipes/:id — any subset of the editable fields, plus an
 *  optional reordered/trimmed image gallery. */
export type UpdateRecipeRequest = Partial<RecipeContent> & { images?: string[] }

/** Body of POST /api/recipes/import. */
export interface ImportRecipeRequest {
  url: string
}
