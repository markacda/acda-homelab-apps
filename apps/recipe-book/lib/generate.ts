import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderBook } from "./latex.ts";
import type { Templates, RenderPaths } from "./latex.ts";
import { OUTPUT_DIR, DATA_DIR, IMAGES_DIR } from "./store.ts";
import type { Book, Recipe } from "./types.ts";

const execFileAsync = promisify(execFile);

// The (user-owned) LaTeX layout lives outside dist/ and is read at runtime.
// cwd is the app dir in dev and /app in Docker; the Dockerfile copies templates/
// into /app, so this resolves in both.
const TEMPLATES_DIR = join(process.cwd(), "templates");
const FONT_DIR = join(TEMPLATES_DIR, "font");

async function loadTemplates(): Promise<Templates> {
  const [book, recipe] = await Promise.all([
    readFile(join(TEMPLATES_DIR, "book.tex"), "utf8"),
    readFile(join(TEMPLATES_DIR, "recipe.tex"), "utf8"),
  ]);
  return { book, recipe };
}

/** LaTeX wants forward slashes; fontspec's Path also needs a trailing slash. */
function texPathValue(p: string, trailingSlash = false): string {
  const s = p.replace(/\\/g, "/");
  return trailingSlash && !s.endsWith("/") ? `${s}/` : s;
}

function renderPaths(): RenderPaths {
  return {
    fontDir: texPathValue(FONT_DIR, true),
    imagesDir: texPathValue(IMAGES_DIR),
  };
}

/** Render the book to a .tex file under OUTPUT_DIR. Returns the file path. */
export async function generateTex(book: Book, recipes: Recipe[]): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const tex = renderBook(book, recipes, await loadTemplates(), renderPaths());
  const texPath = join(OUTPUT_DIR, `${book.id}.tex`);
  await writeFile(texPath, tex, "utf8");
  return texPath;
}

/**
 * Render and compile the book to PDF with Tectonic (which uses XeTeX, so the
 * fontspec Spartan font works). Font and image paths in the document are
 * absolute, so cwd is incidental; DATA_DIR keeps any stray output contained.
 * Returns the PDF path. Throws a readable error if Tectonic is missing or fails.
 */
export async function generatePdf(book: Book, recipes: Recipe[]): Promise<string> {
  const texPath = await generateTex(book, recipes);
  try {
    await execFileAsync("tectonic", [texPath, "--outdir", OUTPUT_DIR, "--chatter", "minimal"], {
      cwd: DATA_DIR,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") {
      throw new Error(
        "PDF generation needs the 'tectonic' LaTeX engine, which is not installed on this host.",
      );
    }
    throw new Error(`LaTeX compilation failed:\n${e.stderr || e.message}`);
  }
  return join(OUTPUT_DIR, `${book.id}.pdf`);
}
