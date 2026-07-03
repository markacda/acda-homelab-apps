import { test } from "node:test";
import assert from "node:assert/strict";
import { crossoverPrice } from "../public/crossover.js";

test("computes the crossover price from the defaults", () => {
  // (1.95 × 400) / (15 × 60) = 780 / 900 = 0.8666...
  const price = crossoverPrice({ petrolPrice: 1.95, consumption: 15, capacity: 60, range: 400 });
  assert.equal(Math.round(price * 1000) / 1000, 0.867);
});

test("accepts numeric strings (as they arrive from form inputs)", () => {
  const price = crossoverPrice({
    petrolPrice: "2",
    consumption: "20",
    capacity: "50",
    range: "500",
  });
  // (2 × 500) / (20 × 50) = 1000 / 1000 = 1
  assert.equal(price, 1);
});

test("returns null when any input is missing, zero or negative", () => {
  const base = { petrolPrice: 1.95, consumption: 15, capacity: 60, range: 400 };
  assert.equal(crossoverPrice({ ...base, petrolPrice: 0 }), null);
  assert.equal(crossoverPrice({ ...base, consumption: -1 }), null);
  assert.equal(crossoverPrice({ ...base, capacity: "" }), null);
  assert.equal(crossoverPrice({ ...base, range: "abc" }), null);
});
