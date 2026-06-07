import dayjs from "dayjs";

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
  const normalizedTime = timeText.trim().padStart(5, "0");
  const parsed = dayjs(`${dateText}T${normalizedTime}:00`);
  if (!parsed.isValid()) {
    throw new Error("时间格式错误");
  }
  return parsed.toDate().toISOString();
}

export function dateTextFromDate(date: Date) {
  return dayjs(date).format("YYYY-MM-DD");
}

export function timeTextFromDate(date: Date) {
  return dayjs(date).format("HH:mm");
}

export function parseDateText(value: unknown) {
  if (value instanceof Date) return dayjs(value).format("YYYY-MM-DD");
  const text = String(value ?? "").trim();
  const parsed = dayjs(text);
  if (!parsed.isValid()) throw new Error("日期格式错误");
  return parsed.format("YYYY-MM-DD");
}

export function parseTimeText(value: unknown) {
  if (value instanceof Date) return dayjs(value).format("HH:mm");
  const text = String(value ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(text)) return text;
  throw new Error("时间格式错误");
}
