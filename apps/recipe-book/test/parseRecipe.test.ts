import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecipe, extractJsonLdBlocks, stripHtml } from "../lib/parseRecipe.ts";

// An Allerhande-shaped page: a JSON-LD @graph with a Recipe node, HowToStep
// instructions, an image array, and some HTML inside the fields.
function pageWith(recipeJson: unknown): string {
  const graph = { "@context": "https://schema.org", "@graph": [recipeJson] };
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify(graph)}</script>
    </head><body>...</body></html>`;
}

const AH_RECIPE = {
  "@type": "Recipe",
  name: "Pappardelle met kogelbiefstuk",
  image: [{ "@type": "ImageObject", url: "https://static.ah.nl/img/recipe.jpg" }],
  recipeYield: "4 personen",
  recipeCategory: "Hoofdgerecht",
  recipeIngredient: ["250 g pappardelle", "2 el <b>olijfolie</b>", "300 g kogelbiefstuk"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Kook de pappardelle beetgaar." },
    { "@type": "HowToStep", text: "Bak de <i>biefstuk</i> kort aan." },
  ],
};

test("extractJsonLdBlocks pulls every ld+json script", () => {
  const html = `<script type="application/ld+json">{"a":1}</script>
    <script type="application/ld+json">{"b":2}</script>`;
  assert.deepEqual(extractJsonLdBlocks(html), ['{"a":1}', '{"b":2}']);
});

test("stripHtml removes tags and decodes entities", () => {
  assert.equal(stripHtml("2 el <b>olijfolie</b> &amp; zout"), "2 el olijfolie & zout");
});

test("parseRecipe extracts a Recipe from a @graph", () => {
  const parsed = parseRecipe(pageWith(AH_RECIPE));
  assert.ok(parsed, "should find a recipe");
  assert.equal(parsed.title, "Pappardelle met kogelbiefstuk");
  assert.equal(parsed.imageUrl, "https://static.ah.nl/img/recipe.jpg");
  assert.equal(parsed.servings, "4 personen");
  assert.equal(parsed.category, "Hoofdgerecht");
  assert.deepEqual(parsed.ingredients, [
    "250 g pappardelle",
    "2 el olijfolie",
    "300 g kogelbiefstuk",
  ]);
  assert.deepEqual(parsed.steps, ["Kook de pappardelle beetgaar.", "Bak de biefstuk kort aan."]);
});

test("parseRecipe handles a top-level Recipe (no @graph) and string image", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Soep",
    image: "https://x/soep.png",
    recipeIngredient: ["water"],
    recipeInstructions: "Stap een\nStap twee",
  })}</script>`;
  const parsed = parseRecipe(html);
  assert.ok(parsed);
  assert.equal(parsed.imageUrl, "https://x/soep.png");
  assert.deepEqual(parsed.steps, ["Stap een", "Stap twee"]);
});

test("parseRecipe flattens HowToSection instructions", () => {
  const parsed = parseRecipe(
    pageWith({
      "@type": "Recipe",
      name: "Menu",
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Voorbereiding",
          itemListElement: [
            { "@type": "HowToStep", text: "Snijd de ui." },
            { "@type": "HowToStep", text: "Verhit de pan." },
          ],
        },
      ],
    }),
  );
  assert.ok(parsed);
  assert.deepEqual(parsed.steps, ["Snijd de ui.", "Verhit de pan."]);
});

test("parseRecipe returns null when there is no Recipe node", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "WebPage",
    name: "Not a recipe",
  })}</script>`;
  assert.equal(parseRecipe(html), null);
});

test("parseRecipe tolerates a malformed ld+json block", () => {
  const html = `<script type="application/ld+json">{ not json ]</script>
    ${pageWith(AH_RECIPE)}`;
  const parsed = parseRecipe(html);
  assert.ok(parsed);
  assert.equal(parsed.title, "Pappardelle met kogelbiefstuk");
});
