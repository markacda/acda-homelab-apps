import { test } from "node:test";
import assert from "node:assert/strict";
import { healthHandler, errorHandler, errorLogger } from "./app.ts";

// Minimal res double — the handlers only touch these members.
function fakeRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("healthHandler responds 200 { status: 'ok' }", () => {
  const res = fakeRes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  healthHandler()({} as any, res as any, (() => {}) as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("errorHandler responds 500 { error } for an unhandled error", () => {
  const res = fakeRes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorHandler("test-app")(new Error("boom"), {} as any, res as any, (() => {}) as any);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Internal server error" });
});

test("errorLogger re-forwards the error via next(err)", () => {
  const err = new Error("boom");
  let forwarded: unknown = null;
  const next = (e: unknown) => {
    forwarded = e;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorLogger("test-app")(err, {} as any, {} as any, next as any);
  assert.equal(forwarded, err);
});

test("errorHandler does not write a body once headers are sent", () => {
  const res = fakeRes();
  res.headersSent = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorHandler("test-app")(new Error("boom"), {} as any, res as any, (() => {}) as any);
  assert.equal(res.statusCode, 200); // untouched
  assert.equal(res.body, undefined);
});
