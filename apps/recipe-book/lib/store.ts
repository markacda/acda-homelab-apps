import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, extname } from "node:path";
import type { Recipe, Book, RecipeInput } from "./types.ts";

// JSON-file persistence on a Docker volume (no database), mirroring the pattern
// in apps/dynamic-vs-fixed/lib/energyzero.ts. Layout under DATA_DIR:
//   recipes/<id>.json   images/<id>-<short>.<ext>   books/<id>.json   output/<id>.{tex,pdf}
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
export const RECIPES_DIR = join(DATA_DIR, "recipes");
export const IMAGES_DIR = join(DATA_DIR, "images");
export const BOOKS_DIR = join(DATA_DIR, "books");
export const OUTPUT_DIR = join(DATA_DIR, "output");

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

/** List the json files in a dir (basenames without extension), tolerant of a missing dir. */
async function listIds(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
  } catch {
    return [];
  }
}

// ---- recipes --------------------------------------------------------------

export async function listRecipes(): Promise<Recipe[]> {
  const ids = await listIds(RECIPES_DIR);
  const recipes = await Promise.all(ids.map((id) => getRecipe(id)));
  return recipes
    .filter((r): r is Recipe => r !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  return readJson<Recipe>(join(RECIPES_DIR, `${id}.json`));
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  await ensureDir(RECIPES_DIR);
  recipe.updatedAt = nowIso();
  await writeJson(join(RECIPES_DIR, `${recipe.id}.json`), recipe);
  return recipe;
}

/** Build and persist a brand-new recipe from an editable field set. */
export async function createRecipe(input: RecipeInput): Promise<Recipe> {
  const ts = nowIso();
  const recipe: Recipe = {
    id: randomUUID(),
    sourceUrl: input.sourceUrl ?? null,
    title: input.title,
    imageUrl: input.imageUrl ?? null,
    images: [],
    ingredients: input.ingredients,
    steps: input.steps,
    servings: input.servings,
    prepTime: input.prepTime,
    cookTime: input.cookTime,
    totalTime: input.totalTime,
    notes: input.notes,
    category: input.category,
    createdAt: ts,
    updatedAt: ts,
  };
  return saveRecipe(recipe);
}

export async function deleteRecipe(id: string): Promise<void> {
  const recipe = await getRecipe(id);
  for (const filename of recipe?.images ?? []) await deleteImageFile(filename);
  await unlink(join(RECIPES_DIR, `${id}.json`)).catch(() => {});
}

// ---- images ---------------------------------------------------------------

async function deleteImageFile(filename: string): Promise<void> {
  await unlink(join(IMAGES_DIR, filename)).catch(() => {});
}

// Only these raster formats embed cleanly in LaTeX via \includegraphics.
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
};

/** Map a content-type / url to a LaTeX-safe extension, or null if unsupported (e.g. webp). */
export function imageExt(contentType: string | null, url: string | null): string | null {
  if (contentType) {
    const ct = contentType.split(";")[0].trim().toLowerCase();
    if (EXT_BY_TYPE[ct]) return EXT_BY_TYPE[ct];
  }
  const urlExt = url ? extname(new URL(url, "https://x").pathname).toLowerCase() : "";
  if (urlExt === ".jpg" || urlExt === ".jpeg") return ".jpg";
  if (urlExt === ".png") return ".png";
  return null;
}

/** Write an image buffer under a unique filename and return it (no recipe update). */
async function writeImageFile(recipeId: string, buffer: Buffer, ext: string): Promise<string> {
  await ensureDir(IMAGES_DIR);
  const filename = `${recipeId}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(join(IMAGES_DIR, filename), buffer);
  return filename;
}

/** Append an uploaded image to a recipe's gallery. Returns the updated recipe. */
export async function addImageBuffer(recipe: Recipe, buffer: Buffer, ext: string): Promise<Recipe> {
  const filename = await writeImageFile(recipe.id, buffer, ext);
  recipe.images.push(filename);
  return saveRecipe(recipe);
}

/**
 * Download a remote image and append it to a recipe's gallery. Returns the updated
 * recipe, or null if the URL is unreachable or the format is unsupported (webp/svg).
 */
export async function addImageFromUrl(recipe: Recipe, url: string): Promise<Recipe | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;
    const ext = imageExt(res.headers.get("content-type"), url);
    if (!ext) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await addImageBuffer(recipe, buffer, ext);
  } catch {
    return null;
  }
}

/**
 * Set a recipe's image order to `filenames` (must be a permutation/subset of its
 * current images). Any image no longer referenced has its file deleted. Returns
 * the updated recipe.
 */
export async function setImages(recipe: Recipe, filenames: string[]): Promise<Recipe> {
  const current = new Set(recipe.images);
  const next = filenames.filter((f) => current.has(f));
  for (const f of recipe.images) {
    if (!next.includes(f)) await deleteImageFile(f);
  }
  recipe.images = next;
  return saveRecipe(recipe);
}

// Shared with fetchRecipe.ts; a realistic UA lifts some CDN/bot gates.
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// ---- books ----------------------------------------------------------------

export async function listBooks(): Promise<Book[]> {
  const ids = await listIds(BOOKS_DIR);
  const books = await Promise.all(ids.map((id) => getBook(id)));
  return books
    .filter((b): b is Book => b !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getBook(id: string): Promise<Book | null> {
  return readJson<Book>(join(BOOKS_DIR, `${id}.json`));
}

export async function createBook(name: string): Promise<Book> {
  const ts = nowIso();
  const book: Book = { id: randomUUID(), name, recipeIds: [], createdAt: ts, updatedAt: ts };
  return saveBook(book);
}

export async function saveBook(book: Book): Promise<Book> {
  await ensureDir(BOOKS_DIR);
  book.updatedAt = nowIso();
  await writeJson(join(BOOKS_DIR, `${book.id}.json`), book);
  return book;
}

export async function deleteBook(id: string): Promise<void> {
  await unlink(join(BOOKS_DIR, `${id}.json`)).catch(() => {});
}
