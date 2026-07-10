import { optStr, toStringArray } from '../../../Common/http-utils/index.ts';
import type { RecipeContent } from '../../Domain/Aggregates/recipe.ts';

// Translate a raw HTTP request body into the domain's editable field set. The
// Recipe aggregate enforces the invariants (e.g. a non-empty title); the mapper
// only coerces shapes. `toRecipeEdits` includes a key only when it was present
// in the body, so PATCH touches exactly the fields the caller sent.

type Body = Record<string, unknown>;

/** Coerce a full create body into RecipeContent (all editable fields). */
export function toRecipeContent(body: Body): RecipeContent {
  return {
    title: optStr(body.title) ?? '',
    sourceUrl: optStr(body.sourceUrl) ?? null,
    imageUrl: optStr(body.imageUrl) ?? null,
    ingredients: toStringArray(body.ingredients),
    steps: toStringArray(body.steps),
    servings: optStr(body.servings),
    prepTime: optStr(body.prepTime),
    cookTime: optStr(body.cookTime),
    totalTime: optStr(body.totalTime),
    notes: toStringArray(body.notes),
    category: optStr(body.category),
  };
}

/** Coerce a PATCH body into a partial edit, keeping only the keys the caller sent. */
export function toRecipeEdits(body: Body): Partial<RecipeContent> {
  const edits: Partial<RecipeContent> = {};
  if ('title' in body) edits.title = optStr(body.title);
  if ('ingredients' in body) edits.ingredients = toStringArray(body.ingredients);
  if ('steps' in body) edits.steps = toStringArray(body.steps);
  if ('servings' in body) edits.servings = optStr(body.servings);
  if ('prepTime' in body) edits.prepTime = optStr(body.prepTime);
  if ('cookTime' in body) edits.cookTime = optStr(body.cookTime);
  if ('totalTime' in body) edits.totalTime = optStr(body.totalTime);
  if ('notes' in body) edits.notes = toStringArray(body.notes);
  if ('category' in body) edits.category = optStr(body.category);
  return edits;
}
