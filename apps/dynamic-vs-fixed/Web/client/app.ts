const STORAGE_KEY = 'dynamic-vs-fixed:v1';

// Editable numeric/boolean inputs persisted to localStorage (the CSV is not).
const NUMBER_FIELDS = [
  'fixedDayTariff',
  'fixedNightTariff',
  'fixedGasPrice',
  'elecEnergyTax',
  'gasEnergyTax',
  'elecMarkup',
  'gasMarkup',
  'vatPct',
  'dayStartHour',
  'dayEndHour',
];
const BOOL_FIELDS = ['includeGas', 'weekendAllNight'];

const DEFAULTS: Record<string, number | boolean> = {
  fixedDayTariff: 0.35,
  fixedNightTariff: 0.3,
  fixedGasPrice: 1.3,
  elecEnergyTax: 0.1015, // 2025 NL, excl VAT
  gasEnergyTax: 0.578, // 2025 NL, excl VAT
  elecMarkup: 0.02,
  gasMarkup: 0.08,
  vatPct: 21,
  dayStartHour: 7,
  dayEndHour: 23,
  includeGas: true,
  weekendAllNight: true,
};

// Shape of the /api/calculate response (subset the UI renders).
interface CalcResponse {
  result: {
    annual: {
      dynamicCheaper: boolean;
      difference: number;
      pctVsFixed: number;
      fixed: number;
      dynamic: number;
    };
    period: {
      fixedElec: number;
      dynamicElec: number;
      fixedGas: number;
      dynamicGas: number;
      fixed: number;
      dynamic: number;
    };
    usage: { includeGas: boolean; totalKwh: number; totalGasM3: number };
    coverage: {
      intervals: number;
      spanDays: number;
      annualized: boolean;
      missingElecHours: number;
    };
    monthly: Array<{
      month: string;
      kwh: number;
      gasM3: number;
      fixed: number;
      dynamic: number;
      difference: number;
    }>;
  };
  meta: { mapping: unknown };
}

const el = (id: string) => document.getElementById(id) as HTMLElement;
const inp = (id: string) => document.getElementById(id) as HTMLInputElement;
const eur = (n: number) => '€' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function load(): void {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    saved = {};
  }
  for (const id of NUMBER_FIELDS) inp(id).value = String(saved[id] ?? DEFAULTS[id]);
  for (const id of BOOL_FIELDS) inp(id).checked = Boolean(saved[id] ?? DEFAULTS[id]);
}

function save(): void {
  const data: Record<string, string | boolean> = {};
  for (const id of NUMBER_FIELDS) data[id] = inp(id).value;
  for (const id of BOOL_FIELDS) data[id] = inp(id).checked;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function collectParams(): Record<string, number | boolean> {
  const p: Record<string, number | boolean> = {};
  for (const id of NUMBER_FIELDS) p[id] = parseFloat(inp(id).value);
  for (const id of BOOL_FIELDS) p[id] = inp(id).checked;
  return p;
}

function setStatus(msg: string, kind = 'info'): void {
  const s = el('status');
  s.hidden = !msg;
  s.textContent = msg || '';
  s.className = 'status ' + kind;
}

function render({ result, meta }: CalcResponse): void {
  el('result').hidden = false;

  const a = result.annual;
  const cheaper = a.dynamicCheaper;
  el('verdict').textContent = cheaper ? '✅ A dynamic contract would have been cheaper' : '❌ Your fixed contract was cheaper';
  el('verdict').className = 'verdict ' + (cheaper ? 'good' : 'bad');

  el('annualDiff').textContent = eur(Math.abs(a.difference));
  el('annualLabel').textContent = (cheaper ? 'saved per year with dynamic' : 'extra per year with dynamic') + ` (${a.pctVsFixed}% vs fixed)`;

  const rows: Array<[string, number, number]> = [
    ['Electricity', result.period.fixedElec, result.period.dynamicElec],
    ...(result.usage.includeGas ? ([['Gas', result.period.fixedGas, result.period.dynamicGas]] as Array<[string, number, number]>) : []),
    ['Total (period)', result.period.fixed, result.period.dynamic],
    ['Total (annualized)', a.fixed, a.dynamic],
  ];
  el('totalsBody').innerHTML = rows
    .map(
      ([label, f, d]) =>
        `<tr><th>${label}</th><td>${eur(f)}</td><td>${eur(d)}</td>` + `<td class="${f - d >= 0 ? 'good' : 'bad'}">${eur(f - d)}</td></tr>`
    )
    .join('');

  const c = result.coverage;
  let note =
    `Based on ${c.intervals.toLocaleString('nl-NL')} intervals over ${c.spanDays} days` +
    ` (${result.usage.totalKwh} kWh` +
    (result.usage.includeGas ? `, ${result.usage.totalGasM3} m³ gas` : '') +
    `).`;
  if (c.annualized) note += ' Period was scaled to a full year.';
  if (c.missingElecHours) note += ` ${c.missingElecHours} hours had no market price (average used).`;
  el('coverageNote').textContent = note;

  el('monthlyBody').innerHTML = result.monthly
    .map(
      (m) =>
        `<tr><td>${m.month}</td><td>${m.kwh}</td><td>${result.usage.includeGas ? m.gasM3 : '—'}</td>` +
        `<td>${eur(m.fixed)}</td><td>${eur(m.dynamic)}</td>` +
        `<td class="${m.difference >= 0 ? 'good' : 'bad'}">${eur(m.difference)}</td></tr>`
    )
    .join('');

  el('mappingPre').textContent = JSON.stringify(meta.mapping, null, 2);
}

el('calc').addEventListener('submit', async (e) => {
  e.preventDefault();
  save();

  const file = inp('csv').files?.[0];
  if (!file) {
    setStatus('Please choose your HomeWizard CSV export first.', 'error');
    return;
  }

  const btn = el('submitBtn') as HTMLButtonElement;
  btn.disabled = true;
  setStatus('Reading CSV and fetching historic prices… this can take a moment.', 'info');

  try {
    const fd = new FormData();
    fd.append('csv', file);
    fd.append('params', JSON.stringify(collectParams()));

    const res = await fetch('/api/calculate', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Calculation failed.');

    setStatus('', 'info');
    render(data);
    el('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    btn.disabled = false;
  }
});

// Persist edits as you go.
for (const id of [...NUMBER_FIELDS, ...BOOL_FIELDS]) {
  el(id).addEventListener('change', save);
}

load();
