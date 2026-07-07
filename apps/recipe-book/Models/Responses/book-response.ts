import type { BookData } from "../../Domain/Aggregates/book.ts";
import type { RecipeData } from "../../Domain/Aggregates/recipe.ts";

/** GET /api/books/:id — a book with its recipe ids resolved to full recipes. */
export interface BookWithRecipes extends BookData {
  recipes: RecipeData[];
}

/** POST /api/books/:id/generate — where to download the freshly generated output. */
export interface GenerateResponse {
  format: string;
  url: string;
  recipeCount: number;
}
