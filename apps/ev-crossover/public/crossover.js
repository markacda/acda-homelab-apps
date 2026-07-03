// Pure crossover math, shared by the browser UI (app.js) and the unit tests.
// Kept under public/ so the browser can import it directly over HTTP.

/**
 * The electricity price (€/kWh) at which charging is exactly as expensive as
 * petrol. Below it, charging wins; above it, petrol wins.
 *
 *   €/kWh = (petrol price × range) / (consumption × capacity)
 *
 * @param {object} p
 * @param {number|string} p.petrolPrice  € per litre
 * @param {number|string} p.consumption  km per litre
 * @param {number|string} p.capacity     battery capacity in kWh
 * @param {number|string} p.range        electric range in km on a full charge
 * @returns {number|null}  crossover €/kWh, or null if any input is not positive
 */
export function crossoverPrice({ petrolPrice, consumption, capacity, range }) {
  const [p, c, cap, r] = [petrolPrice, consumption, capacity, range].map(Number);
  if (![p, c, cap, r].every((n) => Number.isFinite(n) && n > 0)) return null;
  return (p * r) / (c * cap);
}
