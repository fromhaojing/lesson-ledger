import * as Notifications from "expo-notifications";

import {
  REMINDER_MINUTES_MAX,
  REMINDER_MINUTES_MIN,
  REMINDER_MINUTES_STEP,
  getNotificationsEnabled,
} from "@/modules/notifications/notification.service";
import { getSetting } from "@/modules/settings/settings.repository";
import {
  DEFAULT_NUMBER_WHEEL_MAX,
  DEFAULT_NUMBER_WHEEL_MIN,
  DEFAULT_NUMBER_WHEEL_STEP,
  normalizeNumberWheelValue,
} from "@/components/ui";
import {
  defaultThemeColor,
  normalizeThemeColor,
  themeColorPresets,
  type ThemeColorKey,
  type ThemeMode,
} from "@/theme";

export type ReminderTiming = "before" | "after";

export const APP_VERSION = "1.0.3";

export function normalizeDefaultAmount(value: string) {
  return normalizeNumberWheelValue(
    value,
    DEFAULT_NUMBER_WHEEL_MIN,
    DEFAULT_NUMBER_WHEEL_MAX,
    DEFAULT_NUMBER_WHEEL_STEP,
  );
}

export function normalizeReminderMinutes(value: string) {
  return normalizeNumberWheelValue(
    value,
    REMINDER_MINUTES_MIN,
    REMINDER_MINUTES_MAX,
    REMINDER_MINUTES_STEP,
  );
}

export function themeModeLabel(mode: ThemeMode) {
  if (mode === "light") return "浅色";
  if (mode === "dark") return "深色";
  return "跟随系统";
}

export function themeColorLabel(color: ThemeColorKey) {
  return (
    themeColorPresets.find(
      (preset) => preset.key === normalizeThemeColor(color),
    )?.label ??
    themeColorPresets.find((preset) => preset.key === defaultThemeColor)
      ?.label ??
    "珊瑚红"
  );
}

export function reminderTimingLabel(timing: ReminderTiming) {
  return timing === "after" ? "结束后" : "结束前";
}

export async function getReminderTimingSetting(): Promise<ReminderTiming> {
  const timing = await getSetting("remind_timing", "before");
  return timing === "after" ? "after" : "before";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export async function getNotificationStatusLabel() {
  const appEnabled = await getNotificationsEnabled();
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) return "系统未允许";
  return appEnabled ? "已开启" : "已关闭";
}
