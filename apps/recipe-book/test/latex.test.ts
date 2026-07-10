import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLatex, renderRecipe, renderBook } from '../Adapters/Tectonic/latex-renderer.ts';
import type { Templates, RenderPaths } from '../Adapters/Tectonic/latex-renderer.ts';
import type { RecipeData } from '../Domain/Aggregates/recipe.ts';
import type { BookData } from '../Domain/Aggregates/book.ts';

const TEMPLATES: Templates = {
  book: 'font={{fontDir}}\n\\title{{{bookTitle}}}\n\\begin{document}\n%%RECIPES%%\n\\end{document}',
  recipe:
    'cat=[{{category}}] \\subsection{{{title}}}\n' +
    'servings={{servings}}\n' +
    '\\begin{itemize}\n{{ingredients}}\n\\end{itemize}\n' +
    '{{notesBlock}}\n{{extraImages}}\n' +
    'times={{prepTime}}|{{cookTime}}|{{totalTime}}\n' +
    'title-image={{titleImage}}\n' +
    '\\begin{enumerate}\n{{steps}}\n\\end{enumerate}',
};

const PATHS: RenderPaths = { fontDir: '/app/templates/font/', imagesDir: '/data/images' };

function recipe(overrides: Partial<RecipeData> = {}): RecipeData {
  return {
    id: 'r1',
    sourceUrl: null,
    title: 'Test',
    imageUrl: null,
    images: [],
    ingredients: ['a', 'b'],
    steps: ['do x', 'do y'],
    notes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('escapeLatex escapes all special characters', () => {
  assert.equal(
    escapeLatex('100% & $5 #1 a_b {c} ~x ^y \\z'),
    '100\\% \\& \\$5 \\#1 a\\_b \\{c\\} \\textasciitilde{}x \\textasciicircum{}y \\textbackslash{}z'
  );
});

test('renderRecipe fills tokens, appends servings/time units, escapes text', () => {
  const out = renderRecipe(
    recipe({
      title: 'Soup & Co',
      category: 'Main',
      servings: '4',
      ingredients: ['50% cream'],
      steps: ['stir'],
      prepTime: '10',
      cookTime: '20',
      totalTime: '30',
    }),
    TEMPLATES,
    PATHS
  );
  assert.match(out, /\\subsection\{Soup \\& Co\}/);
  assert.match(out, /cat=\[Main\]/);
  // Bare numbers get their unit appended at render time.
  assert.match(out, /servings=4 personen/);
  assert.match(out, /\\item 50\\% cream/);
  assert.match(out, /\\item stir/);
  assert.match(out, /times=10 min\|20 min\|30 min/);
});

test('renderRecipe: empty servings/time fields render no stray unit', () => {
  const out = renderRecipe(
    recipe({
      servings: undefined,
      prepTime: undefined,
      cookTime: undefined,
      totalTime: undefined,
    }),
    TEMPLATES,
    PATHS
  );
  assert.match(out, /servings=\n/);
  assert.match(out, /times=\|\|/);
  assert.doesNotMatch(out, /personen/);
  assert.doesNotMatch(out, /min/);
});

test('renderRecipe: title image is images[0], extras are the rest with a newpage', () => {
  const out = renderRecipe(recipe({ images: ['r1-a.jpg', 'r1-b.jpg', 'r1-c.png'] }), TEMPLATES, PATHS);
  assert.match(out, /title-image=\\includegraphics\[width=\\linewidth\]\{\/data\/images\/r1-a\.jpg\}/);
  assert.match(out, /\\newpage/);
  assert.match(out, /\/data\/images\/r1-b\.jpg/);
  assert.match(out, /\/data\/images\/r1-c\.png/);
});

test('renderRecipe: no images => empty title image and no extras block', () => {
  const out = renderRecipe(recipe({ images: [] }), TEMPLATES, PATHS);
  assert.match(out, /title-image=\n/);
  assert.doesNotMatch(out, /includegraphics/);
  assert.doesNotMatch(out, /newpage/);
});

test('renderRecipe: notes block only present when notes exist', () => {
  const withNotes = renderRecipe(recipe({ notes: ['let op', 'tip'] }), TEMPLATES, PATHS);
  assert.match(withNotes, /Notities/);
  assert.match(withNotes, /\\item let op/);

  const without = renderRecipe(recipe({ notes: [] }), TEMPLATES, PATHS);
  assert.doesNotMatch(without, /Notities/);
});

test('renderBook injects fontDir/title and groups recipes by category into sections', () => {
  const book: BookData = {
    id: 'b1',
    name: 'My Book',
    recipeIds: ['r1', 'r2', 'r3'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const recipes = [
    recipe({ id: 'r1', title: 'One', category: 'Hoofdgerecht' }),
    recipe({ id: 'r2', title: 'Two', category: 'Salades' }),
    recipe({ id: 'r3', title: 'Three', category: 'Hoofdgerecht' }),
  ];
  const out = renderBook(book, recipes, TEMPLATES, PATHS);
  assert.match(out, /font=\/app\/templates\/font\//);
  assert.match(out, /\\title\{My Book\}/);
  assert.doesNotMatch(out, /%%RECIPES%%/);
  // One \section per distinct category, in first-appearance order.
  assert.match(out, /\\section\{Hoofdgerecht\}[\s\S]*\\section\{Salades\}/);
  assert.equal(out.match(/\\section\{/g)?.length, 2);
  // All three recipes rendered as subsections.
  assert.match(out, /\\subsection\{One\}/);
  assert.match(out, /\\subsection\{Two\}/);
  assert.match(out, /\\subsection\{Three\}/);
});

test("renderBook falls back to 'Overig' for uncategorized recipes", () => {
  const book: BookData = {
    id: 'b1',
    name: 'B',
    recipeIds: ['r1'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const out = renderBook(book, [recipe({ category: undefined })], TEMPLATES, PATHS);
  assert.match(out, /\\section\{Overig\}/);
});
