// String primitives shared by the person value objects. No domain rules live here —
// each value object decides what to do with the cleaned result.

/**
 * Normalize untrusted text: reject a non-string, compose to NFC (so visually equal input
 * compares equal), collapse every whitespace run to a single space, drop the control
 * characters that survive that (they carry no meaning in a name and would forge fields
 * in the JSON-Lines logs), then trim. Anything reducing to nothing returns ''.
 *
 * Collapsing before stripping is deliberate: a line break becomes a space, so a pasted
 * two-line value reads as "Ada Lovelace" rather than running the words together.
 */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

/** Length in code points, so an astral character (emoji) counts as one, not two. */
export function codePointLength(value: string): number {
  return [...value].length;
}
