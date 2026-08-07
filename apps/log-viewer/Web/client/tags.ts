// Shared helpers for the tag filter dropdown used by all four log views.
// Tags are a general labelling mechanism on telemetry records; today's producers
// both emit "Healthcheck" — the DB health-check ping and the dashboard's health
// probes — which we hide by default so their frequent dependency rows (SELECT 1,
// and a GET per tile every 30s) don't dominate the tables.

/** Dropdown option (and client-only label) that matches records with no tags. */
export const NO_TAG_LABEL = 'No tag';

// Sentinel sent to the server for NO_TAG_LABEL — must match UNTAGGED in
// Domain/ValueObjects/log-filter.ts (the bundler-less client can't import it).
const UNTAGGED = '__untagged__';

/** Tags hidden by default: present but unchecked, so the user can opt in. */
export const DEFAULT_HIDDEN_TAGS = ['Healthcheck'];

/**
 * The dropdown options for a `tags` meta facet: the distinct tags (always
 * including the default-hidden ones so they stay togglable even before any such
 * record has been ingested), sorted, with the "No tag" option appended.
 */
export function tagOptions(metaTags: string[]): string[] {
  const tags = [...new Set([...metaTags, ...DEFAULT_HIDDEN_TAGS])].sort();
  return [...tags, NO_TAG_LABEL];
}

/** The default selection: everything except the default-hidden tags. */
export function defaultTagSelection(options: string[]): string[] {
  return options.filter((o) => !DEFAULT_HIDDEN_TAGS.includes(o));
}

/**
 * Turn the dropdown selection into the `tags` query value, mapping "No tag" to
 * the untagged sentinel. Empty selection (all checked) → null (no tag filter).
 */
export function tagsParam(selected: string[]): string | null {
  if (selected.length === 0) return null;
  return selected.map((t) => (t === NO_TAG_LABEL ? UNTAGGED : t)).join(',');
}
