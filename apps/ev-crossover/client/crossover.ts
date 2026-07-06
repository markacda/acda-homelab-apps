// Pure crossover math, shared by the browser UI (app.ts) and the unit tests.
// Compiled to public/crossover.js so the browser can import it over HTTP; the
// Node test imports this .ts source directly.

export interface CrossoverInputs {
  petrolPrice: number | string; // € per litre
  consumption: number | string; // km per litre
  capacity: number | string; // battery capacity in kWh
  range: number | string; // electric range in km on a full charge
}

/**
 * The electricity price (€/kWh) at which charging is exactly as expensive as
 * petrol. Below it, charging wins; above it, petrol wins.
 *
 *   €/kWh = (petrol price × range) / (consumption × capacity)
 *
 * Returns null if any input is not a positive, finite number.
 */
export function crossoverPrice({
  petrolPrice,
  consumption,
  capacity,
  range,
}: CrossoverInputs): number | null {
  const [p, c, cap, r] = [petrolPrice, consumption, capacity, range].map(Number);
  if (![p, c, cap, r].every((n) => Number.isFinite(n) && n > 0)) return null;
  return (p * r) / (c * cap);
}
