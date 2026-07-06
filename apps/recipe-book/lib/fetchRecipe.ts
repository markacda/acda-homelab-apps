import { BROWSER_UA } from "./store.ts";

// Fetch the raw HTML of an Allerhande recipe page. AH sits behind a CDN that
// challenges obvious bots, so we send browser-like headers. This is best-effort:
// if it fails, the UI falls back to manual recipe entry.
export async function fetchRecipeHtml(url: string): Promise<string> {
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
