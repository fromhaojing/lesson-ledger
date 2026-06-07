import * as Notifications from "expo-notifications";

import { lessonRepository } from "@/modules/lessons/lesson.repository";

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

  return count;
}
