import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DocumentGenerator } from "../../Ports/Latex/document-generator.ts";
import type { Book } from "../../Domain/Aggregates/book.ts";
import type { Recipe } from "../../Domain/Aggregates/recipe.ts";
import { renderBook } from "./latex-renderer.ts";
import type { Templates, RenderPaths } from "./latex-renderer.ts";
import { OUTPUT_DIR, DATA_DIR, IMAGES_DIR } from "../JsonFileStore/paths.ts";

const execFileAsync = promisify(execFile);

// The (user-owned) LaTeX layout lives outside dist/ and is read at runtime.
// cwd is the app dir in dev and /app in Docker; the Dockerfile copies templates/
// into /app, so this resolves in both.
const TEMPLATES_DIR = join(process.cwd(), "templates");
const FONT_DIR = join(TEMPLATES_DIR, "font");

/** LaTeX wants forward slashes; fontspec's Path also needs a trailing slash. */
function texPathValue(p: string, trailingSlash = false): string {
  const s = p.replace(/\\/g, "/");
  return trailingSlash && !s.endsWith("/") ? `${s}/` : s;
}

/** DocumentGenerator that renders with the bundled templates and compiles via Tectonic. */
export class TectonicPdfRenderer implements DocumentGenerator {
  /** Render the book to a .tex file under OUTPUT_DIR. Returns the file path. */
  async generateTex(book: Book, recipes: Recipe[]): Promise<string> {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const tex = renderBook(book, recipes, await this.loadTemplates(), this.renderPaths());
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
  async generatePdf(book: Book, recipes: Recipe[]): Promise<string> {
    const texPath = await this.generateTex(book, recipes);
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

  outputPath(bookId: string, format: "tex" | "pdf"): string {
    return join(OUTPUT_DIR, `${bookId}.${format}`);
  }

  private async loadTemplates(): Promise<Templates> {
    const [book, recipe] = await Promise.all([
      readFile(join(TEMPLATES_DIR, "book.tex"), "utf8"),
      readFile(join(TEMPLATES_DIR, "recipe.tex"), "utf8"),
    ]);
    return { book, recipe };
  }

  private renderPaths(): RenderPaths {
    return {
      fontDir: texPathValue(FONT_DIR, true),
      imagesDir: texPathValue(IMAGES_DIR),
    };
  }
}
