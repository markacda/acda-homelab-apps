import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeLatex, renderRecipe, renderBook } from "../lib/latex.ts";
import type { Templates } from "../lib/latex.ts";
import type { Recipe, Book } from "../lib/types.ts";

const TEMPLATES: Templates = {
  book: "\\title{{{bookTitle}}}\n\\begin{document}\n%%RECIPES%%\n\\end{document}",
  recipe:
    "\\section{{{title}}}\n{{categoryLine}}\n{{image}}\n" +
    "\\begin{itemize}\n{{ingredients}}\n\\end{itemize}\n" +
    "\\begin{enumerate}\n{{steps}}\n\\end{enumerate}",
};

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    sourceUrl: null,
    title: "Test",
    imageUrl: null,
    imageFile: null,
    ingredients: ["a", "b"],
    steps: ["do x", "do y"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("escapeLatex escapes all special characters", () => {
  assert.equal(
    escapeLatex("100% & $5 #1 a_b {c} ~x ^y \\z"),
    "100\\% \\& \\$5 \\#1 a\\_b \\{c\\} \\textasciitilde{}x \\textasciicircum{}y \\textbackslash{}z",
  );
});

test("renderRecipe fills tokens, builds item lists, escapes text", () => {
  const out = renderRecipe(
    recipe({ title: "Soup & Co", category: "Main", ingredients: ["50% cream"], steps: ["stir"] }),
    TEMPLATES,
  );
  assert.match(out, /\\section\{Soup \\& Co\}/);
  assert.match(out, /\\textit\{Main\}/);
  assert.match(out, /\\item 50\\% cream/);
  assert.match(out, /\\item stir/);
});

test("renderRecipe emits includegraphics only when an image file is present", () => {
  const withImg = renderRecipe(recipe({ imageFile: "r1.jpg" }), TEMPLATES);
  assert.match(withImg, /\\includegraphics\[width=\\linewidth\]\{images\/r1\.jpg\}/);

  const withoutImg = renderRecipe(recipe({ imageFile: null }), TEMPLATES);
  assert.doesNotMatch(withoutImg, /includegraphics/);
});

test("renderRecipe leaves the category line empty when there is no category", () => {
  const out = renderRecipe(recipe({ category: undefined }), TEMPLATES);
  assert.doesNotMatch(out, /textit/);
});

test("renderBook injects title and all recipes at the marker", () => {
  const book: Book = {
    id: "b1",
    name: "My Book",
    recipeIds: ["r1", "r2"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const out = renderBook(
    book,
    [recipe({ title: "One" }), recipe({ id: "r2", title: "Two" })],
    TEMPLATES,
  );
  assert.match(out, /\\title\{My Book\}/);
  assert.doesNotMatch(out, /%%RECIPES%%/);
  assert.match(out, /\\section\{One\}/);
  assert.match(out, /\\section\{Two\}/);
});
