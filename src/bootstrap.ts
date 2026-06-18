import { AppState } from "react-native";

import { runMigrations } from "@/db/migrations";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { getSetting, setSetting } from "@/modules/settings/settings.repository";
import {
  defaultThemeColor,
  normalizeThemeColor,
  normalizeThemeMode,
  setThemeColor,
  setThemeMode,
} from "@/theme";

let foregroundHooked = false;

export async function bootstrapApp() {
  await runMigrations();
  const storedThemeMode = await getSetting("theme_mode", "unspecified");
  const themeMode = normalizeThemeMode(storedThemeMode);
  setThemeMode(themeMode);
  if (storedThemeMode !== themeMode) {
    await setSetting("theme_mode", themeMode);
  }
  setThemeColor(
    normalizeThemeColor(await getSetting("theme_color", defaultThemeColor)),
  );
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
