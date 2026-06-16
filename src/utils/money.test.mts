/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { parseAmount } from "./money.ts";
import { normalizeNumberWheelValue } from "./number.ts";

test("parseAmount accepts formatted currency text", () => {
  assert.equal(parseAmount("¥1,280.5"), 1280.5);
});

test("parseAmount rejects invalid and negative amounts", () => {
  assert.throws(() => parseAmount("abc"), /金额不是有效数字/);
  assert.throws(() => parseAmount("-1"), /金额不是有效数字/);
});

test("normalizeNumberWheelValue no longer clamps common lesson amounts at 500", () => {
  assert.equal(normalizeNumberWheelValue("800"), "800");
  assert.equal(normalizeNumberWheelValue("12000"), "10000");
});

test("normalizeNumberWheelValue snaps values to wheel step", () => {
  assert.equal(normalizeNumberWheelValue("153", 50, 500, 5), "155");
  assert.equal(normalizeNumberWheelValue("51", 50, 500, 5), "50");
  assert.equal(normalizeNumberWheelValue("999", 50, 500, 5), "500");
});
