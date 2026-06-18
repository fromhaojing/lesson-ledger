import * as Notifications from "expo-notifications";

import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { getNumberSetting, getSetting, setSetting } from "@/modules/settings/settings.repository";
import { formatMoney } from "@/utils/money";
import { normalizeNumberWheelValue } from "@/utils/number";

type ScheduledLessonNotification = Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>[number];
type ReminderTiming = "before" | "after";

export const REMINDER_MINUTES_MIN = 0;
export const REMINDER_MINUTES_MAX = 30;
export const REMINDER_MINUTES_STEP = 1;

export async function requestNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function syncLessonNotifications({ askPermission = false } = {}) {
  const enabled = await getNotificationsEnabled();
  if (!enabled) {
    await cancelLessonNotifications({ clearStoredIds: true });
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (askPermission ? await requestNotificationPermission() : false);
  if (!granted) return false;

  const reminderSettings = await getReminderSettings();
  const days = await getNumberSetting("notification_schedule_days", 14);
  const limit = await getNumberSetting("notification_schedule_limit", 50);
  const lessons = await lessonRepository.findUpcomingForNotification(
    days,
    limit,
    reminderSettings.timing === "after" ? reminderSettings.minutes : 0
  );
  const scheduled = await getScheduledLessonNotifications();
  const scheduledIds = new Set(scheduled.map((item) => item.identifier));
  const desiredLessonIds: string[] = [];
  const keptNotificationIds = new Set<string>();

  for (const lesson of lessons) {
    const reminderAt = getLessonReminderAt(lesson, reminderSettings);
    if (!reminderAt) {
      if (lesson.notificationId) {
        await cancelNotificationId(lesson.notificationId);
        await lessonRepository.updateNotificationId(lesson.id, null);
      }
      continue;
    }

    desiredLessonIds.push(lesson.id);
    const scheduledAt = reminderAt.toISOString();
    const canReuse =
      lesson.notificationId &&
      lesson.notificationScheduledAt === scheduledAt &&
      scheduledIds.has(lesson.notificationId);

    if (canReuse && lesson.notificationId) {
      keptNotificationIds.add(lesson.notificationId);
      continue;
    }

    if (lesson.notificationId) {
      await cancelNotificationId(lesson.notificationId);
    }

    const notificationId = await scheduleLessonNotification(lesson, reminderAt, reminderSettings.timing);
    keptNotificationIds.add(notificationId);
    await lessonRepository.updateNotificationId(lesson.id, notificationId, scheduledAt);
  }

  await cancelStaleLessonNotifications(scheduled, new Set(desiredLessonIds), keptNotificationIds);
  await lessonRepository.clearNotificationIdsExcept(desiredLessonIds);

  return true;
}

export async function getNotificationsEnabled() {
  return (await getSetting("notifications_enabled", "true")) !== "false";
}

export async function setNotificationsEnabled(enabled: boolean) {
  await setSetting("notifications_enabled", String(enabled));
  if (!enabled) {
    await cancelLessonNotifications({ clearStoredIds: true });
    return false;
  }
  return syncLessonNotifications({ askPermission: true });
}

export async function cancelLessonNotifications({ clearStoredIds = false } = {}) {
  const scheduled = await getScheduledLessonNotifications();
  for (const item of scheduled) {
    await Notifications.cancelScheduledNotificationAsync(item.identifier);
  }
  if (clearStoredIds) await lessonRepository.clearAllNotificationIds();
}

async function getScheduledLessonNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.filter((item) => item.content.data?.type === "lesson_confirm");
}

async function cancelNotificationId(notificationId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // The OS may already have delivered or discarded this notification.
  }
}

async function cancelStaleLessonNotifications(
  scheduled: ScheduledLessonNotification[],
  desiredLessonIds: Set<string>,
  keptNotificationIds: Set<string>
) {
  for (const item of scheduled) {
    const lessonId = item.content.data?.lessonId;
    if (typeof lessonId !== "string" || !desiredLessonIds.has(lessonId) || !keptNotificationIds.has(item.identifier)) {
      await cancelNotificationId(item.identifier);
    }
  }
}

function getLessonReminderAt(lesson: Lesson, reminderSettings: { minutes: number; timing: ReminderTiming }) {
  const direction = reminderSettings.timing === "after" ? 1 : -1;
  const remindAt = new Date(new Date(lesson.endAt).getTime() + direction * reminderSettings.minutes * 60 * 1000);

  return remindAt <= new Date() ? null : remindAt;
}

async function scheduleLessonNotification(lesson: Lesson, remindAt: Date, timing: ReminderTiming) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: timing === "after" ? "课程已结束" : "课程快结束了",
      body: `${lesson.title}，点击确认 ${formatMoney(lesson.defaultAmount)}`,
      data: {
        type: "lesson_confirm",
        lessonId: lesson.id,
        url: `/lessons/${lesson.id}/confirm`
      }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: remindAt
    }
  });
}

async function getReminderSettings(): Promise<{ minutes: number; timing: ReminderTiming }> {
  const [minutes, value] = await Promise.all([
    getNumberSetting("remind_before_minutes", 5),
    getSetting("remind_timing", "before")
  ]);
  return {
    minutes: Number(
      normalizeNumberWheelValue(
        String(minutes),
        REMINDER_MINUTES_MIN,
        REMINDER_MINUTES_MAX,
        REMINDER_MINUTES_STEP,
      ),
    ),
    timing: value === "after" ? "after" : "before"
  };
}
