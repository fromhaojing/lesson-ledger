import { AppState } from "react-native";

import { runMigrations } from "@/db/migrations";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { getSetting } from "@/modules/settings/settings.repository";
import { normalizeThemeColor, setThemeColor, setThemeMode, type ThemeMode } from "@/theme";

let foregroundHooked = false;

export async function bootstrapApp() {
  await runMigrations();
  setThemeMode((await getSetting("theme_mode", "system")) as ThemeMode);
  setThemeColor(normalizeThemeColor(await getSetting("theme_color", "mint")));
  await lessonRepository.refreshPendingStatuses();
  await syncLessonNotifications({ askPermission: true });
  await syncPendingLessonBadge();

  if (!foregroundHooked) {
    foregroundHooked = true;
    AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        await lessonRepository.refreshPendingStatuses();
        await syncLessonNotifications();
        await syncPendingLessonBadge();
      }
    });
  }
}
