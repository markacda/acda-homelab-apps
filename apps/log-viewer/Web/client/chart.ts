// Minimal dependency-free stacked bar chart (inline SVG). Colours come from the
// app's CSS custom properties so the chart matches the rest of the UI.

import { el, fmtTs } from './dom.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export interface ChartSeries {
  key: string; // property name on each datum
  label: string; // legend label
  varName: string; // CSS custom property, e.g. "--bad"
}

// Each datum is a bucket key plus one numeric field per series.
export type ChartDatum = { bucket: string } & Record<string, number | string>;

const WIDTH = 900;
const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 };

/** Build a responsive stacked bar chart for a `overTime`-style series. */
export function stackedBarChart(data: ChartDatum[], series: ChartSeries[]): HTMLElement {
  if (data.length === 0) return el('p', { class: 'empty' }, 'No data');

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const totals = data.map((d) => series.reduce((sum, s) => sum + (Number(d[s.key]) || 0), 0));
  const maxTotal = Math.max(1, ...totals);

  const n = data.length;
  const slot = plotW / n;
  const barW = Math.max(1, Math.min(slot * 0.8, 40));

  const yFor = (v: number): number => PAD.top + plotH - (v / maxTotal) * plotH;

  const root = svg('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: 'chart-svg',
    preserveAspectRatio: 'none',
    role: 'img',
  });

  // Y baseline + a mid gridline with labels.
  for (const frac of [0, 0.5, 1]) {
    const v = Math.round(maxTotal * frac);
    const y = yFor(v);
    root.append(
      svg('line', {
        x1: PAD.left,
        y1: y,
        x2: WIDTH - PAD.right,
        y2: y,
        class: 'chart-grid',
      }),
      svg('text', { x: PAD.left - 6, y: y + 3, class: 'chart-axis', 'text-anchor': 'end' }, String(v))
    );
  }

  // Stacked bars.
  data.forEach((d, i) => {
    const x = PAD.left + i * slot + (slot - barW) / 2;
    let yTop = yFor(0);
    for (const s of series) {
      const val = Number(d[s.key]) || 0;
      if (val <= 0) continue;
      const h = (val / maxTotal) * plotH;
      yTop -= h;
      const rect = svg('rect', {
        x,
        y: yTop,
        width: barW,
        height: h,
        fill: `var(${s.varName})`,
      });
      rect.append(svg('title', {}, `${fmtTs(d.bucket)} · ${s.label}: ${val}`));
      root.append(rect);
    }
  });

  // Sparse x-axis labels (first, middle, last) — bucket strings are ISO-ish.
  const xLabelIdx = [...new Set([0, Math.floor(n / 2), n - 1])];
  for (const i of xLabelIdx) {
    const x = PAD.left + i * slot + slot / 2;
    root.append(svg('text', { x, y: HEIGHT - 8, class: 'chart-axis', 'text-anchor': 'middle' }, shortBucket(data[i].bucket)));
  }

  const legend = el(
    'div',
    { class: 'chart-legend' },
    ...series.map((s) =>
      el('span', { class: 'chart-legend-item' }, el('span', { class: 'chart-swatch', style: `background: var(${s.varName})` }), s.label)
    )
  );

  return el('div', { class: 'chart' }, root, legend);
}

/** Trim a bucket key ("YYYY-MM-DD" or "YYYY-MM-DDTHH") to something compact. */
function shortBucket(bucket: string): string {
  if (bucket.length === 13) return bucket.slice(5).replace('T', ' ') + ':00'; // MM-DD HH:00
  return bucket.slice(5); // MM-DD
}
