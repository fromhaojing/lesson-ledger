import * as Notifications from "expo-notifications";

import { lessonRepository } from "@/modules/lessons/lesson.repository";

type PendingLessonBadgeCountListener = (count: number) => void;

const pendingLessonBadgeCountListeners =
  new Set<PendingLessonBadgeCountListener>();

export function subscribePendingLessonBadgeCount(
  listener: PendingLessonBadgeCountListener,
) {
  pendingLessonBadgeCountListeners.add(listener);
  return () => {
    pendingLessonBadgeCountListeners.delete(listener);
  };
}

export async function getPendingLessonBadgeCount() {
  await lessonRepository.refreshPendingStatuses();
  return lessonRepository.countPendingLessons();
}

export async function syncPendingLessonBadge() {
  const count = await getPendingLessonBadgeCount();

  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.warn("Failed to sync app badge count", error);
  }

  notifyPendingLessonBadgeCount(count);

  return count;
}

function notifyPendingLessonBadgeCount(count: number) {
  for (const listener of pendingLessonBadgeCountListeners) {
    listener(count);
  }
}
