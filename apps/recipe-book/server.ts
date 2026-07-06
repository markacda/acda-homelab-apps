import express, { type Response } from "express";
import multer from "multer";
import { join } from "node:path";
import { pageLoadLogger } from "../../packages/access-log/logger.ts";
import { fetchRecipeHtml } from "./lib/fetchRecipe.ts";
import { parseRecipe } from "./lib/parseRecipe.ts";
import { generateTex, generatePdf } from "./lib/generate.ts";
import {
  listRecipes,
  getRecipe,
  saveRecipe,
  createRecipe,
  deleteRecipe,
  downloadImage,
  saveImageBuffer,
  imageExt,
  listBooks,
  getBook,
  createBook,
  saveBook,
  deleteBook,
  OUTPUT_DIR,
  IMAGES_DIR,
} from "./lib/store.ts";
import type { Recipe, Book, RecipeInput } from "./lib/types.ts";

const app = express();
const PORT = Number(process.env.PORT) || 6005;

app.use(pageLoadLogger("recipe-book"));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // recipe photos are small
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// ---- input helpers --------------------------------------------------------

/** Coerce a body value (string[] or newline-separated string) to a trimmed string[]. */
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Build a validated RecipeInput from a request body, or throw a 400-worthy error. */
function toRecipeInput(body: Record<string, unknown>): RecipeInput {
  const title = optStr(body.title);
  if (!title) throw new Error("A recipe title is required.");
  return {
    title,
    sourceUrl: optStr(body.sourceUrl) ?? null,
    imageUrl: optStr(body.imageUrl) ?? null,
    ingredients: toStringArray(body.ingredients),
    steps: toStringArray(body.steps),
    servings: optStr(body.servings),
    category: optStr(body.category),
  };
}

/** Resolve a book's ordered recipe ids into recipes, skipping any that no longer exist. */
async function resolveBookRecipes(book: Book): Promise<Recipe[]> {
  const recipes = await Promise.all(book.recipeIds.map((id) => getRecipe(id)));
  return recipes.filter((r): r is Recipe => r !== null);
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

// ---- recipes --------------------------------------------------------------

// Import from an Allerhande URL: fetch, parse the JSON-LD, download the image.
app.post("/api/recipes/import", async (req, res) => {
  try {
    const url = optStr(req.body?.url);
    if (!url) return fail(res, 400, "A recipe URL is required.");

    const html = await fetchRecipeHtml(url);
    const parsed = parseRecipe(html);
    if (!parsed) {
      return fail(
        res,
        422,
        "Could not find recipe data on that page. You can add the recipe manually instead.",
      );
    }

    const recipe = await createRecipe({
      title: parsed.title,
      sourceUrl: url,
      imageUrl: parsed.imageUrl,
      ingredients: parsed.ingredients,
      steps: parsed.steps,
      servings: parsed.servings,
      category: parsed.category,
    });

    if (parsed.imageUrl) {
      const imageFile = await downloadImage(recipe.id, parsed.imageUrl);
      if (imageFile) {
        recipe.imageFile = imageFile;
        await saveRecipe(recipe);
      }
    }

    res.status(201).json(recipe);
  } catch (err) {
    fail(res, 502, err instanceof Error ? err.message : "Import failed.");
  }
});

// Create a recipe manually from a full field set.
app.post("/api/recipes", async (req, res) => {
  try {
    const input = toRecipeInput(req.body ?? {});
    const recipe = await createRecipe(input);
    if (input.imageUrl) {
      const imageFile = await downloadImage(recipe.id, input.imageUrl);
      if (imageFile) {
        recipe.imageFile = imageFile;
        await saveRecipe(recipe);
      }
    }
    res.status(201).json(recipe);
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : "Could not create recipe.");
  }
});

app.get("/api/recipes", async (_req, res) => {
  res.json(await listRecipes());
});

app.get("/api/recipes/:id", async (req, res) => {
  const recipe = await getRecipe(req.params.id);
  if (!recipe) return fail(res, 404, "Recipe not found.");
  res.json(recipe);
});

// Edit any of the recipe's text fields.
app.patch("/api/recipes/:id", async (req, res) => {
  try {
    const recipe = await getRecipe(req.params.id);
    if (!recipe) return fail(res, 404, "Recipe not found.");
    const body = req.body ?? {};
    if ("title" in body) {
      const title = optStr(body.title);
      if (!title) throw new Error("Title cannot be empty.");
      recipe.title = title;
    }
    if ("ingredients" in body) recipe.ingredients = toStringArray(body.ingredients);
    if ("steps" in body) recipe.steps = toStringArray(body.steps);
    if ("servings" in body) recipe.servings = optStr(body.servings);
    if ("category" in body) recipe.category = optStr(body.category);
    res.json(await saveRecipe(recipe));
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : "Could not update recipe.");
  }
});

app.delete("/api/recipes/:id", async (req, res) => {
  await deleteRecipe(req.params.id);
  res.status(204).end();
});

// Replace a recipe's image — either an uploaded file or a URL to download.
app.put("/api/recipes/:id/image", upload.single("image"), async (req, res) => {
  try {
    // The extra multer middleware defeats Express's path param inference, so
    // req.params.id widens to string | string[]; it is always a string here.
    const id = req.params.id as string;
    const recipe = await getRecipe(id);
    if (!recipe) return fail(res, 404, "Recipe not found.");

    if (req.file) {
      const ext = imageExt(req.file.mimetype, req.file.originalname);
      if (!ext) return fail(res, 415, "Only JPG or PNG images are supported.");
      recipe.imageFile = await saveImageBuffer(recipe.id, req.file.buffer, ext);
      recipe.imageUrl = null;
    } else {
      const imageUrl = optStr(req.body?.imageUrl);
      if (!imageUrl) return fail(res, 400, "Provide an image file or an imageUrl.");
      const imageFile = await downloadImage(recipe.id, imageUrl);
      if (!imageFile) {
        return fail(res, 422, "Could not download that image (unreachable or unsupported format).");
      }
      recipe.imageFile = imageFile;
      recipe.imageUrl = imageUrl;
    }
    res.json(await saveRecipe(recipe));
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : "Could not update image.");
  }
});

// ---- books ----------------------------------------------------------------

app.get("/api/books", async (_req, res) => {
  res.json(await listBooks());
});

app.post("/api/books", async (req, res) => {
  const name = optStr(req.body?.name);
  if (!name) return fail(res, 400, "A book name is required.");
  res.status(201).json(await createBook(name));
});

app.get("/api/books/:id", async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return fail(res, 404, "Book not found.");
  res.json({ ...book, recipes: await resolveBookRecipes(book) });
});

// Rename and/or set the ordered recipe list (used for reorder / add / remove).
app.patch("/api/books/:id", async (req, res) => {
  try {
    const book = await getBook(req.params.id);
    if (!book) return fail(res, 404, "Book not found.");
    const body = req.body ?? {};
    if ("name" in body) {
      const name = optStr(body.name);
      if (!name) throw new Error("Book name cannot be empty.");
      book.name = name;
    }
    if ("recipeIds" in body) {
      if (
        !Array.isArray(body.recipeIds) ||
        body.recipeIds.some((x: unknown) => typeof x !== "string")
      ) {
        throw new Error("recipeIds must be an array of strings.");
      }
      book.recipeIds = body.recipeIds as string[];
    }
    res.json(await saveBook(book));
  } catch (err) {
    fail(res, 400, err instanceof Error ? err.message : "Could not update book.");
  }
});

app.delete("/api/books/:id", async (req, res) => {
  await deleteBook(req.params.id);
  res.status(204).end();
});

// Generate the book output (.tex or .pdf) and return a download link.
app.post("/api/books/:id/generate", async (req, res) => {
  try {
    const book = await getBook(req.params.id);
    if (!book) return fail(res, 404, "Book not found.");
    const format = req.body?.format === "pdf" ? "pdf" : "tex";
    const recipes = await resolveBookRecipes(book);
    if (recipes.length === 0) return fail(res, 400, "The book has no recipes to generate.");

    if (format === "pdf") {
      await generatePdf(book, recipes);
    } else {
      await generateTex(book, recipes);
    }
    res.json({
      format,
      url: `/api/books/${book.id}/download/${format}`,
      recipeCount: recipes.length,
    });
  } catch (err) {
    fail(res, 500, err instanceof Error ? err.message : "Generation failed.");
  }
});

const CONTENT_TYPE: Record<string, string> = {
  tex: "application/x-tex",
  pdf: "application/pdf",
};

app.get("/api/books/:id/download/:format", async (req, res) => {
  const format = req.params.format;
  if (format !== "tex" && format !== "pdf") return fail(res, 400, "Unknown format.");
  const book = await getBook(req.params.id);
  if (!book) return fail(res, 404, "Book not found.");
  const path = join(OUTPUT_DIR, `${book.id}.${format}`);
  const safeName = book.name.replace(/[^\w.-]+/g, "_") || "recipe-book";
  res.type(CONTENT_TYPE[format]);
  res.download(path, `${safeName}.${format}`, (err) => {
    if (err && !res.headersSent) fail(res, 404, "Output not found — generate it first.");
  });
});

// Serve downloaded recipe images from the data volume at /images/<file>.
app.use("/images", express.static(IMAGES_DIR));

// public/ resolves from the app root (cwd) — true both in dev (npm runs from the
// app dir) and in Docker (WORKDIR /app).
app.use(express.static(join(process.cwd(), "public")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`recipe-book listening on http://0.0.0.0:${PORT}`);
});
