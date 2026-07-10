// A right-hand detail drawer, shared by both views. One sheet exists at a time;
// opening a new one replaces the previous.

import { el } from './dom.ts'

export interface SheetRow {
  label: string
  value: string | Node
  /** Render the value in a monospace, pre-wrapped block (for JSON / stacks). */
  mono?: boolean
}

let overlay: HTMLElement | undefined
let keyHandler: ((ev: KeyboardEvent) => void) | undefined

export function closeSheet(): void {
  if (overlay) {
    overlay.remove()
    overlay = undefined
  }
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler)
    keyHandler = undefined
  }
}

/** Open (or replace) the side-sheet with a titled table of label/value rows. */
export function openSheet(title: string, rows: SheetRow[]): void {
  closeSheet()

  const body = el(
    'div',
    { class: 'sheet-body' },
    ...rows.map((r) =>
      el(
        'div',
        { class: 'sheet-row' },
        el('div', { class: 'sheet-label' }, r.label),
        el('div', { class: `sheet-value${r.mono ? ' mono' : ''}` }, r.value)
      )
    )
  )

  const closeBtn = el('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Close' }, '×')
  closeBtn.addEventListener('click', closeSheet)

  const sheet = el(
    'aside',
    { class: 'sheet', role: 'dialog', 'aria-label': title },
    el('header', { class: 'sheet-header' }, el('h2', {}, title), closeBtn),
    body
  )
  // Clicks inside the sheet must not fall through to the overlay's dismiss.
  sheet.addEventListener('click', (ev) => ev.stopPropagation())

  overlay = el('div', { class: 'sheet-overlay' }, sheet)
  overlay.addEventListener('click', closeSheet) // click outside dismisses
  document.body.append(overlay)

  keyHandler = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') closeSheet()
  }
  document.addEventListener('keydown', keyHandler)
}
