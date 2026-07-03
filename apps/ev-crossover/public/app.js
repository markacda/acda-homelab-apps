import { crossoverPrice } from "./crossover.js";

const STORAGE_KEY = "ev-crossover:v1";

const FIELDS = ["petrolPrice", "consumption", "capacity", "range"];

const DEFAULTS = {
  petrolPrice: 1.95, // € per litre
  consumption: 15, // km per litre
  capacity: 60, // kWh
  range: 400, // km
};

const inputs = Object.fromEntries(FIELDS.map((id) => [id, document.getElementById(id)]));
const resultValue = document.getElementById("resultValue");
const resultText = document.getElementById("resultText");

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    saved = {};
  }
  for (const id of FIELDS) {
    const value = saved[id] ?? DEFAULTS[id];
    inputs[id].value = value;
  }
}

function save() {
  const data = Object.fromEntries(FIELDS.map((id) => [id, inputs[id].value]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* localStorage unavailable — ignore, calc still works */
  }
}

function compute() {
  const crossover = crossoverPrice({
    petrolPrice: inputs.petrolPrice.value,
    consumption: inputs.consumption.value,
    capacity: inputs.capacity.value,
    range: inputs.range.value,
  });

  if (crossover == null) {
    resultValue.textContent = "—";
    resultText.textContent = "Enter positive values in all four fields to see the crossover price.";
    return;
  }

  resultValue.textContent = `€${crossover.toFixed(3)}`;
  resultText.innerHTML =
    `Charging is <strong>cheaper</strong> than petrol whenever your ` +
    `electricity price is below <strong>€${crossover.toFixed(3)}/kWh</strong>. ` +
    `Above that, petrol wins.`;
}

function onInput() {
  save();
  compute();
}

for (const id of FIELDS) {
  inputs[id].addEventListener("input", onInput);
}

load();
compute();
