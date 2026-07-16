import { getDatabase } from "@/db/database";
import { createId } from "@/utils/id";
import type { CreateLessonInput, Lesson, LessonStatus } from "@/modules/lessons/lesson.types";

type Database = Awaited<ReturnType<typeof getDatabase>>;

type CreateImportBatchInput = {
  filename: string;
  sourceUri?: string | null;
  totalRows: number;
  failedRows: number;
  lessons: CreateLessonInput[];
};

type LessonRow = Omit<Lesson, "studentNames" | "importBatchId" | "dateText" | "startAt" | "endAt" | "courseType" | "defaultAmount" | "finalAmount" | "notificationId" | "notificationScheduledAt" | "confirmedAt" | "cancelledAt" | "createdAt" | "updatedAt"> & {
  import_batch_id: string | null;
  student_names: string;
  date_text: string;
  start_at: string;
  end_at: string;
  course_type: string | null;
  default_amount: number;
  final_amount: number | null;
  notification_id: string | null;
  notification_scheduled_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    title: row.title,
    studentNames: JSON.parse(row.student_names) as string[],
    dateText: row.date_text,
    startAt: row.start_at,
    endAt: row.end_at,
    grade: row.grade,
    courseType: row.course_type,
    defaultAmount: row.default_amount,
    finalAmount: row.final_amount,
    status: row.status,
    notificationId: row.notification_id,
    notificationScheduledAt: row.notification_scheduled_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const lessonRepository = {
  async create(input: CreateLessonInput) {
    const db = await getDatabase();
    return insertLesson(db, input);
  },

  async createMany(inputs: CreateLessonInput[]) {
    const db = await getDatabase();
    const ids: string[] = [];
    await db.withTransactionAsync(async () => {
      for (const input of inputs) {
        ids.push(await insertLesson(db, input));
      }
    });
    return ids;
  },

  async createImportBatch(input: CreateImportBatchInput) {
    const db = await getDatabase();
    const batchId = createId("import");
    const ids: string[] = [];
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO import_batch (
          id, filename, source_uri, imported_at, total_rows, success_rows, failed_rows
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          input.filename,
          input.sourceUri ?? null,
          now,
          input.totalRows,
          input.lessons.length,
          input.failedRows
        ]
      );

      for (const lesson of input.lessons) {
        ids.push(await insertLesson(db, { ...lesson, importBatchId: batchId }));
      }
    });

    return { batchId, ids };
  },

  async findById(id: string) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<LessonRow>("SELECT * FROM lesson WHERE id = ? AND deleted_at IS NULL", [id]);
    return row ? toLesson(row) : null;
  },

  async findByDate(dateText: string) {
    const db = await getDatabase();
    const rows = await db.getAllAsync<LessonRow>(
      "SELECT * FROM lesson WHERE date_text = ? AND deleted_at IS NULL ORDER BY start_at ASC",
      [dateText]
    );
    return rows.map(toLesson);
  },

  async findBetween(startDate: string, endDate: string) {
    const db = await getDatabase();
    const rows = await db.getAllAsync<LessonRow>(
      "SELECT * FROM lesson WHERE date_text >= ? AND date_text <= ? AND deleted_at IS NULL ORDER BY start_at ASC",
      [startDate, endDate]
    );
    return rows.map(toLesson);
  },

  async findBySearchPrefix(prefix: string) {
    const searchPrefix = prefix.trim();
    if (!searchPrefix) return [];

    const db = await getDatabase();
    const escapedPrefix = escapeLikePattern(searchPrefix);
    const rows = await db.getAllAsync<LessonRow>(
      `SELECT * FROM lesson
       WHERE deleted_at IS NULL
         AND (
           title LIKE ? ESCAPE '\\'
           OR student_names LIKE ? ESCAPE '\\'
           OR student_names LIKE ? ESCAPE '\\'
         )
       ORDER BY date_text ASC, start_at ASC`,
      [`${escapedPrefix}%`, `["${escapedPrefix}%`, `%","${escapedPrefix}%`]
    );
    return rows.map(toLesson);
  },

  async findPendingLessons() {
    const db = await getDatabase();
    const rows = await db.getAllAsync<LessonRow>(
      `SELECT * FROM lesson
       WHERE deleted_at IS NULL
         AND status IN ('pending', 'scheduled')
         AND end_at < ?
       ORDER BY end_at ASC`,
      [new Date().toISOString()]
    );
    return rows.map(toLesson);
  },

  async countPendingLessons() {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM lesson
       WHERE deleted_at IS NULL
         AND status IN ('pending', 'scheduled')
         AND end_at < ?`,
      [new Date().toISOString()]
    );
    return row?.count ?? 0;
  },

  async findUpcomingForNotification(days: number, limit: number, includeRecentlyEndedMinutes = 0) {
    const db = await getDatabase();
    const now = new Date();
    const start = new Date(now.getTime() - includeRecentlyEndedMinutes * 60 * 1000);
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const rows = await db.getAllAsync<LessonRow>(
      `SELECT * FROM lesson
       WHERE deleted_at IS NULL
         AND status IN ('scheduled', 'pending')
         AND end_at > ?
         AND end_at <= ?
       ORDER BY end_at ASC
       LIMIT ?`,
      [start.toISOString(), end.toISOString(), limit]
    );
    return rows.map(toLesson);
  },

  async findLessonsWithNotifications() {
    const db = await getDatabase();
    const rows = await db.getAllAsync<LessonRow>(
      "SELECT * FROM lesson WHERE deleted_at IS NULL AND notification_id IS NOT NULL"
    );
    return rows.map(toLesson);
  },

  async update(id: string, input: Partial<CreateLessonInput>) {
    const current = await lessonRepository.findById(id);
    if (!current) return;

    const next = {
      title: input.title ?? current.title,
      studentNames: input.studentNames ?? current.studentNames,
      dateText: input.dateText ?? current.dateText,
      startAt: input.startAt ?? current.startAt,
      endAt: input.endAt ?? current.endAt,
      grade: input.grade ?? current.grade,
      courseType: input.courseType ?? current.courseType,
      defaultAmount: input.defaultAmount ?? current.defaultAmount,
      note: input.note ?? current.note
    };

    const db = await getDatabase();
    await db.runAsync(
      `UPDATE lesson SET
        title = ?, student_names = ?, date_text = ?, start_at = ?, end_at = ?,
        grade = ?, course_type = ?, default_amount = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.title,
        JSON.stringify(next.studentNames),
        next.dateText,
        next.startAt,
        next.endAt,
        next.grade,
        next.courseType,
        next.defaultAmount,
        next.note,
        new Date().toISOString(),
        id
      ]
    );
  },

  async remove(id: string) {
    const db = await getDatabase();
    await db.runAsync("UPDATE lesson SET deleted_at = ?, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      new Date().toISOString(),
      id
    ]);
  },

  async confirmAmount(id: string, amount: number, note?: string) {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `UPDATE lesson
       SET status = 'confirmed', final_amount = ?, confirmed_at = ?, note = COALESCE(?, note), updated_at = ?
       WHERE id = ? AND deleted_at IS NULL AND status IN ('scheduled', 'pending')`,
      [amount, now, note ?? null, now, id]
    );
    assertUpdated(result.changes, "当前课程状态无法确认金额");
  },

  async confirmManyWithDefaultAmounts(ids: string[]) {
    const lessonIds = Array.from(new Set(ids));
    if (lessonIds.length === 0) return 0;

    const db = await getDatabase();
    const now = new Date().toISOString();
    const placeholders = lessonIds.map(() => "?").join(",");
    const result = await db.runAsync(
      `UPDATE lesson
       SET status = 'confirmed',
           final_amount = COALESCE(final_amount, default_amount),
           confirmed_at = ?,
           updated_at = ?
       WHERE id IN (${placeholders})
         AND deleted_at IS NULL
         AND status IN ('scheduled', 'pending')`,
      [now, now, ...lessonIds]
    );
    return result.changes;
  },

  async markCancelled(id: string) {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const result = await db.runAsync(
      `UPDATE lesson
       SET status = 'cancelled', final_amount = 0, cancelled_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL AND status IN ('scheduled', 'pending')`,
      [now, now, id]
    );
    assertUpdated(result.changes, "当前课程状态无法取消");
  },

  async updateNotificationId(id: string, notificationId: string | null, scheduledAt?: string | null) {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE lesson SET notification_id = ?, notification_scheduled_at = ?, updated_at = ? WHERE id = ?",
      [notificationId, notificationId ? (scheduledAt ?? new Date().toISOString()) : null, new Date().toISOString(), id]
    );
  },

  async clearAllNotificationIds() {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE lesson SET notification_id = NULL, notification_scheduled_at = NULL, updated_at = ? WHERE notification_id IS NOT NULL",
      [new Date().toISOString()]
    );
  },

  async clearNotificationIdsExcept(ids: string[]) {
    const db = await getDatabase();
    const now = new Date().toISOString();
    if (ids.length === 0) {
      await lessonRepository.clearAllNotificationIds();
      return;
    }

    const placeholders = ids.map(() => "?").join(",");
    await db.runAsync(
      `UPDATE lesson
       SET notification_id = NULL, notification_scheduled_at = NULL, updated_at = ?
       WHERE notification_id IS NOT NULL AND id NOT IN (${placeholders})`,
      [now, ...ids]
    );
  },

  async refreshPendingStatuses() {
    const db = await getDatabase();
    await db.runAsync(
      "UPDATE lesson SET status = 'pending', updated_at = ? WHERE status = 'scheduled' AND end_at < ? AND deleted_at IS NULL",
      [new Date().toISOString(), new Date().toISOString()]
    );
  },

  async countByStatus(status: LessonStatus) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM lesson WHERE status = ? AND deleted_at IS NULL",
      [status]
    );
    return row?.count ?? 0;
  }
};

async function insertLesson(db: Database, input: CreateLessonInput) {
  const now = new Date().toISOString();
  const id = createId("lesson");
  const title = input.title?.trim() || input.studentNames.join("、");

  await db.runAsync(
    `INSERT INTO lesson (
      id, import_batch_id, title, student_names, date_text, start_at, end_at,
      grade, course_type, default_amount, final_amount, status, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.importBatchId ?? null,
      title,
      JSON.stringify(input.studentNames),
      input.dateText,
      input.startAt,
      input.endAt,
      input.grade ?? null,
      input.courseType ?? null,
      input.defaultAmount ?? 0,
      null,
      "scheduled",
      input.note ?? null,
      now,
      now
    ]
  );

  return id;
}

function assertUpdated(changes: number, message: string) {
  if (changes === 0) {
    throw new Error(message);
  }
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
