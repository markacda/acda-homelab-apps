const STORAGE_KEY = "dynamic-vs-fixed:v1";

// Editable numeric/boolean inputs persisted to localStorage (the CSV is not).
const NUMBER_FIELDS = [
  "fixedDayTariff",
  "fixedNightTariff",
  "fixedGasPrice",
  "elecEnergyTax",
  "gasEnergyTax",
  "elecMarkup",
  "gasMarkup",
  "vatPct",
  "dayStartHour",
  "dayEndHour",
];
const BOOL_FIELDS = ["includeGas", "weekendAllNight"];

const DEFAULTS = {
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

const el = (id) => document.getElementById(id);
const eur = (n) =>
  "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    saved = {};
  }
  for (const id of NUMBER_FIELDS) el(id).value = saved[id] ?? DEFAULTS[id];
  for (const id of BOOL_FIELDS) el(id).checked = saved[id] ?? DEFAULTS[id];
}

function save() {
  const data = {};
  for (const id of NUMBER_FIELDS) data[id] = el(id).value;
  for (const id of BOOL_FIELDS) data[id] = el(id).checked;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function collectParams() {
  const p = {};
  for (const id of NUMBER_FIELDS) p[id] = parseFloat(el(id).value);
  for (const id of BOOL_FIELDS) p[id] = el(id).checked;
  return p;
}

function setStatus(msg, kind = "info") {
  const s = el("status");
  s.hidden = !msg;
  s.textContent = msg || "";
  s.className = "status " + kind;
}

function render({ result, meta }) {
  el("result").hidden = false;

  const a = result.annual;
  const cheaper = a.dynamicCheaper;
  el("verdict").textContent = cheaper
    ? "✅ A dynamic contract would have been cheaper"
    : "❌ Your fixed contract was cheaper";
  el("verdict").className = "verdict " + (cheaper ? "good" : "bad");

  el("annualDiff").textContent = eur(Math.abs(a.difference));
  el("annualLabel").textContent =
    (cheaper ? "saved per year with dynamic" : "extra per year with dynamic") +
    ` (${a.pctVsFixed}% vs fixed)`;

  const rows = [
    ["Electricity", result.period.fixedElec, result.period.dynamicElec],
    ...(result.usage.includeGas
      ? [["Gas", result.period.fixedGas, result.period.dynamicGas]]
      : []),
    ["Total (period)", result.period.fixed, result.period.dynamic],
    ["Total (annualized)", a.fixed, a.dynamic],
  ];
  el("totalsBody").innerHTML = rows
    .map(
      ([label, f, d]) =>
        `<tr><th>${label}</th><td>${eur(f)}</td><td>${eur(d)}</td>` +
        `<td class="${f - d >= 0 ? "good" : "bad"}">${eur(f - d)}</td></tr>`
    )
    .join("");

  const c = result.coverage;
  let note = `Based on ${c.intervals.toLocaleString("nl-NL")} intervals over ${c.spanDays} days` +
    ` (${result.usage.totalKwh} kWh` +
    (result.usage.includeGas ? `, ${result.usage.totalGasM3} m³ gas` : "") + `).`;
  if (c.annualized) note += " Period was scaled to a full year.";
  if (c.missingElecHours) note += ` ${c.missingElecHours} hours had no market price (average used).`;
  el("coverageNote").textContent = note;

  el("monthlyBody").innerHTML = result.monthly
    .map(
      (m) =>
        `<tr><td>${m.month}</td><td>${m.kwh}</td><td>${result.usage.includeGas ? m.gasM3 : "—"}</td>` +
        `<td>${eur(m.fixed)}</td><td>${eur(m.dynamic)}</td>` +
        `<td class="${m.difference >= 0 ? "good" : "bad"}">${eur(m.difference)}</td></tr>`
    )
    .join("");

  el("mappingPre").textContent = JSON.stringify(meta.mapping, null, 2);
}

el("calc").addEventListener("submit", async (e) => {
  e.preventDefault();
  save();

  const file = el("csv").files[0];
  if (!file) {
    setStatus("Please choose your HomeWizard CSV export first.", "error");
    return;
  }

  const btn = el("submitBtn");
  btn.disabled = true;
  setStatus("Reading CSV and fetching historic prices… this can take a moment.", "info");

  try {
    const fd = new FormData();
    fd.append("csv", file);
    fd.append("params", JSON.stringify(collectParams()));

    const res = await fetch("/api/calculate", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Calculation failed.");

    setStatus("", "info");
    render(data);
    el("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// Persist edits as you go.
for (const id of [...NUMBER_FIELDS, ...BOOL_FIELDS]) {
  el(id).addEventListener("change", save);
}

load();
