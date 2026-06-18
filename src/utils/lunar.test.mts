/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeChineseLunarDateText,
  normalizeChineseLunarDayText,
} from "./lunar.ts";

test("normalizeChineseLunarDayText formats the first ten lunar days", () => {
  assert.equal(normalizeChineseLunarDayText("1"), "初一");
  assert.equal(normalizeChineseLunarDayText("10"), "初十");
  assert.equal(normalizeChineseLunarDayText("十"), "初十");
});

test("normalizeChineseLunarDayText formats later lunar days", () => {
  assert.equal(normalizeChineseLunarDayText("11"), "十一");
  assert.equal(normalizeChineseLunarDayText("20"), "二十");
  assert.equal(normalizeChineseLunarDayText("21"), "廿一");
  assert.equal(normalizeChineseLunarDayText("30"), "三十");
});

test("normalizeChineseLunarDateText formats Intl Chinese calendar dates", () => {
  assert.equal(normalizeChineseLunarDateText("五月1日"), "五月初一");
  assert.equal(normalizeChineseLunarDateText("五月10日"), "五月初十");
  assert.equal(normalizeChineseLunarDateText("五月21日"), "五月廿一");
  assert.equal(normalizeChineseLunarDateText("五月一日"), "五月初一");
  assert.equal(normalizeChineseLunarDateText("五月十日"), "五月初十");
});
