export type LessonStatus = "scheduled" | "pending" | "confirmed" | "cancelled" | "absent";

export type Lesson = {
  id: string;
  importBatchId: string | null;
  title: string;
  studentNames: string[];
  dateText: string;
  startAt: string;
  endAt: string;
  grade: string | null;
  courseType: string | null;
  defaultAmount: number;
  finalAmount: number | null;
  status: LessonStatus;
  notificationId: string | null;
  notificationScheduledAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateLessonInput = {
  title?: string;
  studentNames: string[];
  dateText: string;
  startAt: string;
  endAt: string;
  grade?: string | null;
  courseType?: string | null;
  defaultAmount?: number;
  note?: string | null;
  importBatchId?: string | null;
};
