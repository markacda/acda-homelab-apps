// Shared DOM helpers used by both the Requests and Logs views.

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Tiny createElement helper: el(tag, attrs, ...children). */
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

// ---- formatting -----------------------------------------------------------

export function statusClassName(status: number): string {
  if (status >= 500) return 's5';
  if (status >= 400) return 's4';
  if (status >= 300) return 's3';
  return 's2';
}

export function fmtTs(ts: string): string {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toISOString();
}

export function fmtMs(ms: number): string {
  return `${ms} ms`;
}

/** A small coloured badge, e.g. a status code or a log level. */
export function pill(text: string, cls: string): HTMLElement {
  return el('span', { class: `pill ${cls}` }, text);
}

// ---- summary card ---------------------------------------------------------

export function card(label: string, value: string, cls = '', title = '', onClick?: () => void): HTMLElement {
  const attrs: Record<string, string> = { class: `card ${cls}${onClick ? ' clickable' : ''}` };
  if (title) attrs.title = title;
  const node = el('div', attrs, el('div', { class: 'card-value' }, value), el('div', { class: 'card-label' }, label));
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// ---- stat table -----------------------------------------------------------

/** Build a stat table. `colClasses[i]` (if given) is applied to column i's cells. */
export function table(headers: string[], rows: (string | Node)[][], colClasses: string[] = []): HTMLElement {
  if (rows.length === 0) return el('p', { class: 'empty' }, 'No data');
  const thead = el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', {}, h))));
  const tbody = el(
    'tbody',
    {},
    ...rows.map((r) =>
      el(
        'tr',
        {},
        ...r.map((c, i) => {
          const attrs: Record<string, string> = {};
          if (colClasses[i]) attrs.class = colClasses[i];
          // Long URL cells get a hover title so the ellipsized text stays readable.
          if (colClasses[i] === 'cell-url' && typeof c === 'string') attrs.title = c;
          return el('td', attrs, c);
        })
      )
    )
  );
  return el('table', { class: 'stat-table' }, thead, tbody);
}

// ---- checkbox multi-select dropdown --------------------------------------

export interface CheckboxDropdown {
  /** Replace the option list, preserving selection (see below for "all"). */
  setOptions(values: string[]): void;
  /** Programmatically set the selection (intersected with current options). Does
   * NOT fire onChange — the caller drives any reload itself. */
  setSelected(values: string[]): void;
  /** Selected values for the query; empty array means "no filter" (all). */
  selected(): string[];
  /** True when there ARE options but none are checked — i.e. "match nothing".
   * Callers use this to short-circuit to an empty view, since `selected()`
   * cannot distinguish "none" from "all" (both return []). */
  isNone(): boolean;
}

const openDropdowns = new Set<HTMLElement>();
document.addEventListener('click', (ev) => {
  for (const menu of openDropdowns) {
    if (!menu.parentElement!.contains(ev.target as Node)) closeDropdown(menu);
  }
});
function closeDropdown(menu: HTMLElement): void {
  menu.hidden = true;
  openDropdowns.delete(menu);
}

/**
 * Turn a container `<div class="dropdown">` into a checkbox multi-select with a
 * "Select all" master. "All checked" means no filter, so `selected()` returns [];
 * a strict subset returns those values. "None checked" also returns [] from
 * `selected()`, but is reported distinctly by `isNone()` so callers can render an
 * empty view rather than treating it as "all".
 */
export function checkboxDropdown(container: HTMLElement, allLabel: string, onChange: () => void): CheckboxDropdown {
  let options: string[] = [];
  let checked = new Set<string>();

  const toggle = el('button', { type: 'button', class: 'dropdown-toggle' }, allLabel);
  const master = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const masterLabel = el('label', { class: 'dropdown-item master' }, master, 'Select all');
  const optionsBox = el('div', { class: 'dropdown-options' });
  const menu = el('div', { class: 'dropdown-menu' }, masterLabel, optionsBox);
  menu.hidden = true;
  container.replaceChildren(toggle, menu);

  function isAll(): boolean {
    return options.length > 0 && checked.size === options.length;
  }
  function isNone(): boolean {
    return options.length > 0 && checked.size === 0;
  }
  function updateSummary(): void {
    // No options yet (before meta loads) reads as the neutral "all" label.
    toggle.textContent = isNone() ? 'None' : isAll() || checked.size === 0 ? allLabel : `${checked.size} selected`;
    master.checked = isAll();
    master.indeterminate = checked.size > 0 && !isAll();
  }
  function render(): void {
    optionsBox.replaceChildren(
      ...options.map((v) => {
        const box = el('input', { type: 'checkbox' }) as HTMLInputElement;
        box.checked = checked.has(v);
        box.addEventListener('change', () => {
          if (box.checked) checked.add(v);
          else checked.delete(v);
          updateSummary();
          onChange();
        });
        return el('label', { class: 'dropdown-item' }, box, v);
      })
    );
    updateSummary();
  }

  toggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (menu.hidden) {
      menu.hidden = false;
      openDropdowns.add(menu);
    } else closeDropdown(menu);
  });
  master.addEventListener('change', () => {
    checked = isAll() ? new Set() : new Set(options);
    render();
    onChange();
  });

  return {
    setOptions(values: string[]): void {
      const wasAll = options.length === 0 || isAll();
      options = values;
      checked = wasAll ? new Set(values) : new Set([...checked].filter((v) => values.includes(v)));
      render();
    },
    setSelected(values: string[]): void {
      checked = new Set(values.filter((v) => options.includes(v)));
      render();
    },
    selected(): string[] {
      return isAll() ? [] : [...checked];
    },
    isNone,
  };
}
