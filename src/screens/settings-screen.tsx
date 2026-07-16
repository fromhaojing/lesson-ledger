import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { SettingsGroup, SettingsRow } from "@/components/settings-ui";
import { getSetting } from "@/modules/settings/settings.repository";
import {
  getNotificationStatusLabel,
  getReminderTimingSetting,
  normalizeDefaultAmount,
  normalizeReminderMinutes,
  reminderTimingLabel,
  themeColorLabel,
  themeModeLabel,
  type ReminderTiming,
} from "@/screens/settings/settings-helpers";
import { useTheme, useThemeColor, useThemeMode } from "@/theme";

export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const themeColor = useThemeColor();
  const themeMode = useThemeMode();
  const [remind, setRemind] = useState("5");
  const [remindTiming, setRemindTiming] = useState<ReminderTiming>("before");
  const [defaultAmount, setDefaultAmount] = useState("150");
  const [notificationStatus, setNotificationStatus] = useState("已开启");

  const load = useCallback(async () => {
    setRemind(
      normalizeReminderMinutes(await getSetting("remind_before_minutes", "5")),
    );
    setRemindTiming(await getReminderTimingSetting());
    setDefaultAmount(
      normalizeDefaultAmount(await getSetting("default_amount", "150")),
    );
    setNotificationStatus(await getNotificationStatusLabel());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View
      collapsable={false}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    >
      <SafeAreaScrollView
        contentContainerStyle={{ paddingHorizontal: 16 }}
        style={{ backgroundColor: theme.colors.background, flex: 1 }}
      >
        <SettingsGroup>
          <SettingsRow
            icon="moon-outline"
            iconBackground="#5856D6"
            title="外观"
            value={themeModeLabel(themeMode)}
            onPress={() => router.push("/settings/appearance")}
          />
          <SettingsRow
            icon="color-palette-outline"
            iconBackground={theme.colors.primary}
            title="主题色"
            value={themeColorLabel(themeColor)}
            onPress={() => router.push("/settings/theme-color")}
          />
        </SettingsGroup>
        <SettingsGroup>
          <SettingsRow
            icon="school-outline"
            iconBackground="#30B0A3"
            title="课程设置"
            value={`${normalizeDefaultAmount(defaultAmount)} 元 · ${reminderTimingLabel(
              remindTiming,
            )} ${normalizeReminderMinutes(remind)} 分钟`}
            onPress={() => router.push("/settings/defaults")}
          />
          <SettingsRow
            icon="notifications-outline"
            iconBackground="#FF9F0A"
            title="通知"
            value={notificationStatus}
            onPress={() => router.push("/settings/notifications")}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="lock-closed-outline"
            iconBackground="#34C759"
            title="隐私与数据"
            value="本机存储"
            onPress={() => router.push("/settings/privacy")}
          />
          <SettingsRow
            icon="information-circle-outline"
            iconBackground="#007AFF"
            title="关于"
            value="课时记"
            onPress={() => router.push("/settings/about")}
          />
        </SettingsGroup>
      </SafeAreaScrollView>
    </View>
  );
}
