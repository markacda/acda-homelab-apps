import { test } from "node:test";
import assert from "node:assert/strict";
import { firstStr, optStr, csvList, toStringArray, clampInt } from "./index.ts";
import { memoryUpload } from "./upload.ts";

test("firstStr unwraps repeated params and rejects empties", () => {
  assert.equal(firstStr("hi"), "hi");
  assert.equal(firstStr(["a", "b"]), "a");
  assert.equal(firstStr(""), undefined);
  assert.equal(firstStr(undefined), undefined);
  assert.equal(firstStr(42), undefined);
});

test("optStr trims and rejects blank", () => {
  assert.equal(optStr("  hi  "), "hi");
  assert.equal(optStr("   "), undefined);
  assert.equal(optStr(undefined), undefined);
});

test("csvList splits, trims, de-dupes", () => {
  assert.deepEqual(csvList("a, b ,a,,c"), ["a", "b", "c"]);
  assert.deepEqual(csvList(""), []);
});

test("toStringArray handles arrays and newline strings", () => {
  assert.deepEqual(toStringArray(["a", " b ", 3]), ["a", "b"]);
  assert.deepEqual(toStringArray("a\nb\r\n\nc"), ["a", "b", "c"]);
  assert.deepEqual(toStringArray(null), []);
});

test("clampInt clamps with fallback and optional max", () => {
  assert.equal(clampInt("50", { min: 1, max: 1000, fallback: 100 }), 50);
  assert.equal(clampInt("0", { min: 1, max: 1000, fallback: 100 }), 100); // 0 -> fallback
  assert.equal(clampInt("9999", { min: 1, max: 1000, fallback: 100 }), 1000);
  assert.equal(clampInt("abc", { min: 0, fallback: 0 }), 0);
  assert.equal(clampInt("-5", { min: 0, fallback: 0 }), 0); // clamped up to min
});

test("memoryUpload builds a multer instance with the given size cap", () => {
  const upload = memoryUpload({ fileSizeMB: 10 });
  assert.equal(typeof upload.single, "function");
});
