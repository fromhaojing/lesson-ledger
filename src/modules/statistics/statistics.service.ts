import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { monthRange } from "@/utils/date";

export type Statistics = {
  confirmedAmount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  absentCount: number;
  byStudent: { name: string; count: number }[];
};

export type MonthStatistics = Statistics;

export async function getMonthStatistics(month: string): Promise<MonthStatistics> {
  const { start, end } = monthRange(month);

  return getRangeStatistics(start, end);
}

export async function getRangeStatistics(startDate: string, endDate: string): Promise<Statistics> {
  const lessons = await lessonRepository.findBetween(startDate, endDate);

  return buildStatistics(lessons);
}

function buildStatistics(lessons: Lesson[]): Statistics {
  const confirmed = lessons.filter((lesson) => lesson.status === "confirmed");
  const pending = lessons.filter((lesson) => ["pending", "scheduled"].includes(lesson.status) && lesson.endAt < new Date().toISOString());
  const studentMap = new Map<string, { name: string; count: number }>();

  for (const lesson of confirmed) {
    for (const name of lesson.studentNames) {
      const student = studentMap.get(name) ?? { name, count: 0 };
      student.count += 1;
      studentMap.set(name, student);
    }
  }

  return {
    confirmedAmount: sumAmount(confirmed),
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    cancelledCount: lessons.filter((lesson) => lesson.status === "cancelled").length,
    absentCount: lessons.filter((lesson) => lesson.status === "absent").length,
    byStudent: Array.from(studentMap.values()).sort((a, b) => b.count - a.count)
  };
}

function sumAmount(lessons: Lesson[]) {
  return lessons.reduce((total, lesson) => total + (lesson.finalAmount ?? 0), 0);
}
