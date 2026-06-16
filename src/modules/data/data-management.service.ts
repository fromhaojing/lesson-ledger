import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

import { getDatabase } from "@/db/database";
import { clearImportDraft } from "@/modules/imports/import-draft.store";
import { cancelLessonNotifications } from "@/modules/notifications/notification.service";

type ExportLessonRow = {
  日期: string;
  开始时间: string;
  结束时间: string;
  学生: string;
  年级: string;
  课程类型: string;
  默认金额: number;
  实际金额: number | "";
  状态: string;
  备注: string;
};

type LessonExportRow = {
  date_text: string;
  start_at: string;
  end_at: string;
  student_names: string;
  grade: string | null;
  course_type: string | null;
  default_amount: number;
  final_amount: number | null;
  status: string;
  note: string | null;
};

type SettingRow = {
  key: string;
  value: string;
};

export async function getLocalDataSize() {
  const fileSize = await getDatabaseFileSize();
  if (fileSize > 0) return fileSize;

  const db = await getDatabase();
  const page = await db.getFirstAsync<{ page_size: number }>("PRAGMA page_size");
  const count = await db.getFirstAsync<{ page_count: number }>("PRAGMA page_count");
  return (page?.page_size ?? 0) * (count?.page_count ?? 0);
}

export async function exportDataToExcel() {
  const db = await getDatabase();
  const lessons = await db.getAllAsync<LessonExportRow>(
    `SELECT date_text, start_at, end_at, student_names, grade, course_type,
            default_amount, final_amount, status, note
       FROM lesson
      WHERE deleted_at IS NULL
      ORDER BY date_text ASC, start_at ASC`
  );
  const settings = await db.getAllAsync<SettingRow>("SELECT key, value FROM app_setting ORDER BY key ASC");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lessons.map(toExportLessonRow)), "课程");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settings.map((row) => ({ 设置项: row.key, 值: row.value }))), "设置");

  const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" }) as string;
  const path = `${FileSystem.cacheDirectory}课时记-数据导出-${timestamp()}.xlsx`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      UTI: "org.openxmlformats.spreadsheetml.sheet"
    });
  }

  return path;
}

export async function clearAllUserData() {
  await cancelLessonNotifications();

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM lesson");
    await db.runAsync("DELETE FROM import_batch");
  });
  await db.execAsync("VACUUM");
  await clearImportDraft();
  await clearExportCache();
  await clearAppBadge();
}

async function clearAppBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Badge support varies by platform and permission state; data clearing should still succeed.
  }
}

async function clearExportCache() {
  if (!FileSystem.cacheDirectory) return;

  const filenames = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
  await Promise.all(
    filenames
      .filter((filename) => filename.startsWith("课时记-数据导出-") && filename.endsWith(".xlsx"))
      .map((filename) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${filename}`, { idempotent: true }))
  );
}

function toExportLessonRow(row: LessonExportRow): ExportLessonRow {
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  return {
    日期: row.date_text,
    开始时间: formatTime(start),
    结束时间: formatTime(end),
    学生: parseStudentNames(row.student_names).join("、"),
    年级: row.grade ?? "",
    课程类型: row.course_type ?? "",
    默认金额: row.default_amount,
    实际金额: row.final_amount ?? "",
    状态: statusLabel(row.status),
    备注: row.note ?? ""
  };
}

async function getDatabaseFileSize() {
  if (!FileSystem.documentDirectory) return 0;
  const base = `${FileSystem.documentDirectory}SQLite/lesson-ledger.db`;
  const files = [base, `${base}-wal`, `${base}-shm`];
  let total = 0;
  for (const file of files) {
    const info = await FileSystem.getInfoAsync(file);
    if (info.exists) total += info.size ?? 0;
  }
  return total;
}

function parseStudentNames(value: string) {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function formatTime(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join("");
}

function statusLabel(status: string) {
  return {
    scheduled: "未开始",
    pending: "待确认",
    confirmed: "已确认",
    cancelled: "已取消",
    absent: "缺勤"
  }[status] ?? status;
}
