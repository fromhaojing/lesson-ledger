import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";

import type { CreateLessonInput } from "@/modules/lessons/lesson.types";
import { combineDateTime, parseDateText, parseTimeText } from "@/utils/date";
import { parseAmount } from "@/utils/money";

const fieldAliases = {
  date: ["日期", "上课日期", "课程日期", "date"],
  startTime: ["开始时间", "上课时间", "start", "start_time"],
  endTime: ["结束时间", "下课时间", "end", "end_time"],
  studentNames: ["学生", "学生姓名", "姓名", "student"],
  grade: ["年级", "grade"],
  courseType: ["课程类型", "类型", "班型", "course_type"],
  defaultAmount: ["默认金额", "金额", "课时费", "费用", "price"],
  note: ["备注", "note"]
};

export type ImportPreview = {
  totalRows: number;
  successRows: CreateLessonInput[];
  failedRows: { rowIndex: number; reason: string }[];
};

export async function parseExcelFile(uri: string): Promise<ImportPreview> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64
  });
  const workbook = XLSX.read(base64, { type: "base64", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const successRows: CreateLessonInput[] = [];
  const failedRows: ImportPreview["failedRows"] = [];

  rows.forEach((row, index) => {
    try {
      successRows.push(parseRow(row));
    } catch (error) {
      failedRows.push({
        rowIndex: index + 2,
        reason: error instanceof Error ? error.message : "无法解析该行"
      });
    }
  });

  return {
    totalRows: rows.length,
    successRows,
    failedRows
  };
}

function parseRow(row: Record<string, unknown>): CreateLessonInput {
  const dateText = parseDateText(readField(row, "date", true));
  const startTime = parseTimeText(readField(row, "startTime", true));
  const endTime = parseTimeText(readField(row, "endTime", true));
  const studentText = String(readField(row, "studentNames", true)).trim();
  const studentNames = parseStudentNames(studentText);

  if (studentNames.length === 0) throw new Error("缺少学生");

  return {
    title: studentNames.join("、"),
    studentNames,
    dateText,
    startAt: combineDateTime(dateText, startTime),
    endAt: combineDateTime(dateText, endTime),
    grade: optionalText(readField(row, "grade")),
    courseType: optionalText(readField(row, "courseType")),
    defaultAmount: parseAmount(readField(row, "defaultAmount")),
    note: optionalText(readField(row, "note"))
  };
}

function readField(row: Record<string, unknown>, key: keyof typeof fieldAliases, required = false) {
  const aliases = fieldAliases[key];
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && row[alias] !== "") {
      return row[alias];
    }
  }

  if (required) throw new Error(`缺少必要字段：${aliases[0]}`);
  return "";
}

function parseStudentNames(value: string) {
  return value
    .split(/[\/、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
