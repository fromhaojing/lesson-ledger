/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { combineLessonDateTimeRange, parseDateText, parseTimeText } from "./date.ts";

test("parseDateText rejects overflow dates", () => {
  assert.throws(() => parseDateText("2026-02-31"), /日期格式错误/);
  assert.throws(() => parseDateText("2026-13-01"), /日期格式错误/);
});

test("parseDateText normalizes supported date formats", () => {
  assert.equal(parseDateText("2026-6-1"), "2026-06-01");
  assert.equal(parseDateText("2026/06/01"), "2026-06-01");
});

test("parseTimeText rejects overflow times", () => {
  assert.throws(() => parseTimeText("24:00"), /时间格式错误/);
  assert.throws(() => parseTimeText("99:99"), /时间格式错误/);
});

test("parseTimeText normalizes one digit hours", () => {
  assert.equal(parseTimeText("9:05"), "09:05");
});

test("combineLessonDateTimeRange requires end time after start time", () => {
  assert.throws(() => combineLessonDateTimeRange("2026-06-01", "19:00", "18:00"), /结束时间必须晚于开始时间/);
});
