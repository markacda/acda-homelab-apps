import type { RecipeSource, ParsedRecipe } from "../../Ports/Allerhande/recipe-source.ts";
import { BROWSER_UA } from "../browser-user-agent.ts";
import { parseRecipe } from "./parse.ts";

/**
 * RecipeSource backed by Albert Heijn's Allerhande site: fetch the recipe page's
 * HTML (with browser-like headers, since AH's CDN challenges obvious bots) and
 * extract its schema.org JSON-LD.
 */
export class AllerhandeRecipeSource implements RecipeSource {
  async fetch(url: string): Promise<ParsedRecipe | null> {
    const html = await this.fetchHtml(url);
    return parseRecipe(html);
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Could not fetch recipe page (HTTP ${res.status}).`);
    }
    return res.text();
  }
}
