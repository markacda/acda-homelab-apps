// @homelab/web-kit — shared browser DOM micro-helpers for the homelab frontends.
//
// These three helpers were copy-pasted across the clients (auth, recipe-book,
// log-viewer) with "mirror (not import)" comments; this is their one canonical home.
// Browser-only (DOM globals, no Node types). Compiled into each app's Web/public by
// that app's tsconfig.client.json (see CLAUDE.md — the client build pins rootDir at the
// repo root so it can import this by relative `.ts` path).

/** Throwing element getter — fail loud if a required id is missing. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

/**
 * Tiny createElement helper: `el(tag, attrs, ...children)`. `class` and `title` map to
 * the corresponding properties; every other attribute is set with setAttribute. String
 * children become text nodes.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'title') node.title = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export type StatusKind = '' | 'error' | 'ok' | 'info';

/**
 * Set the text + `status <kind>` class on a status banner element. Callers that also
 * hide the banner when empty do that around this call (the auth pages toggle `hidden`).
 */
export function setStatus(node: HTMLElement, msg: string, kind: StatusKind = ''): void {
  node.textContent = msg;
  node.className = `status ${kind}`.trim();
}
