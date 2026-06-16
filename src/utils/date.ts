import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(customParseFormat);

const dateFormats = ["YYYY-MM-DD", "YYYY-M-D", "YYYY/MM/DD", "YYYY/M/D"];

export function todayText() {
  return dayjs().format("YYYY-MM-DD");
}

export function monthKey(date = new Date()) {
  return dayjs(date).format("YYYY-MM");
}

export function monthRange(month: string) {
  const start = dayjs(`${month}-01`);
  return {
    start: start.format("YYYY-MM-DD"),
    end: start.endOf("month").format("YYYY-MM-DD")
  };
}

export function formatTimeRange(startAt: string, endAt: string) {
  return `${dayjs(startAt).format("HH:mm")} - ${dayjs(endAt).format("HH:mm")}`;
}

export function combineDateTime(dateText: string, timeText: string) {
  const normalizedDate = parseDateText(dateText);
  const normalizedTime = parseTimeText(timeText);
  const parsed = dayjs(`${normalizedDate} ${normalizedTime}`, "YYYY-MM-DD HH:mm", true);
  if (!parsed.isValid()) {
    throw new Error("时间格式错误");
  }
  return parsed.toDate().toISOString();
}

export function combineLessonDateTimeRange(dateText: string, startTime: string, endTime: string) {
  const startAt = combineDateTime(dateText, startTime);
  const endAt = combineDateTime(dateText, endTime);
  validateLessonDateTimeRange(startAt, endAt);

  return { startAt, endAt };
}

export function validateLessonDateTimeRange(startAt: string, endAt: string) {
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new Error("结束时间必须晚于开始时间");
  }
}

export function dateTextFromDate(date: Date) {
  return dayjs(date).format("YYYY-MM-DD");
}

export function timeTextFromDate(date: Date) {
  return dayjs(date).format("HH:mm");
}

export function parseDateText(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("日期格式错误");
    return dayjs(value).format("YYYY-MM-DD");
  }

  const text = String(value ?? "").trim();
  const parsed = dayjs(text, dateFormats, true);
  if (!parsed.isValid()) throw new Error("日期格式错误");
  return parsed.format("YYYY-MM-DD");
}

export function parseTimeText(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("时间格式错误");
    return dayjs(value).format("HH:mm");
  }

  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) throw new Error("时间格式错误");

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("时间格式错误");

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
