# @homelab/web-kit

Shared **browser** DOM micro-helpers for the homelab frontends. These were copy-pasted
across the clients (with "mirror (not import)" comments); this is their canonical home.

Browser-only (DOM globals, no Node types). Imported by relative `.ts` path from an app's
`Web/client` code and compiled into that app's `Web/public` by its `tsconfig.client.json`
(see the root `CLAUDE.md` build model).

## Exports

- `$<T>(id)` — throwing `getElementById` (fails loud on a missing id).
- `el(tag, attrs?, ...children)` — tiny `createElement` helper; `class`/`title` map to the
  properties, other keys use `setAttribute`, string children become text nodes.
- `setStatus(node, msg, kind?)` — set text + `status <kind>` class on a status banner
  (`kind: '' | 'error' | 'ok' | 'info'`).

```ts
import { $, el, setStatus } from '../../../Common/web-kit/index.ts';
const list = $('list');
list.replaceChildren(el('p', { class: 'empty' }, 'No data'));
setStatus($('status'), 'Saved', 'ok');
```
