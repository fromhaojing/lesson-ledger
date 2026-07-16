import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { ChoiceRow, SettingsGroup } from "@/components/settings-ui";
import {
  DEFAULT_NUMBER_WHEEL_MAX,
  DEFAULT_NUMBER_WHEEL_MIN,
  DEFAULT_NUMBER_WHEEL_STEP,
  NumberWheelField,
  PrimaryButton,
} from "@/components/ui";
import {
  REMINDER_MINUTES_MAX,
  REMINDER_MINUTES_MIN,
  REMINDER_MINUTES_STEP,
  syncLessonNotifications,
} from "@/modules/notifications/notification.service";
import { getSetting, setSetting } from "@/modules/settings/settings.repository";
import {
  getReminderTimingSetting,
  normalizeDefaultAmount,
  normalizeReminderMinutes,
  type ReminderTiming,
} from "@/screens/settings/settings-helpers";
import { useTheme } from "@/theme";

export function DefaultSettingsScreen() {
  const theme = useTheme();
  const [remind, setRemind] = useState("5");
  const [remindTiming, setRemindTiming] = useState<ReminderTiming>("before");
  const [defaultAmount, setDefaultAmount] = useState("150");

  const load = useCallback(async () => {
    setRemind(
      normalizeReminderMinutes(await getSetting("remind_before_minutes", "5")),
    );
    setRemindTiming(await getReminderTimingSetting());
    setDefaultAmount(
      normalizeDefaultAmount(await getSetting("default_amount", "150")),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function save() {
    await setSetting(
      "remind_before_minutes",
      normalizeReminderMinutes(remind || "5"),
    );
    await setSetting("remind_timing", remindTiming);
    await setSetting(
      "default_amount",
      normalizeDefaultAmount(defaultAmount || "150"),
    );
    await syncLessonNotifications();
    Alert.alert("已保存", "课程设置已经更新。");
  }

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <SafeAreaScrollView
        bottomOffset={128}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}
        style={{ backgroundColor: theme.colors.background, flex: 1 }}
      >
        <SettingsGroup title="新课程">
          <View style={{ gap: 10, padding: 16 }}>
            <NumberWheelField
              label="课程金额"
              min={DEFAULT_NUMBER_WHEEL_MIN}
              max={DEFAULT_NUMBER_WHEEL_MAX}
              step={DEFAULT_NUMBER_WHEEL_STEP}
              suffix="元"
              value={defaultAmount}
              onChangeText={setDefaultAmount}
            />
            <NumberWheelField
              label="提醒间隔"
              min={REMINDER_MINUTES_MIN}
              max={REMINDER_MINUTES_MAX}
              step={REMINDER_MINUTES_STEP}
              suffix="分钟"
              value={remind}
              onChangeText={setRemind}
            />
          </View>
        </SettingsGroup>
        <SettingsGroup title="提醒时间">
          <ChoiceRow
            title="课程结束前提醒"
            selected={remindTiming === "before"}
            onPress={() => setRemindTiming("before")}
          />
          <ChoiceRow
            title="课程结束后提醒"
            selected={remindTiming === "after"}
            onPress={() => setRemindTiming("after")}
          />
        </SettingsGroup>
      </SafeAreaScrollView>

      <SafeAreaView
        edges={["bottom"]}
        pointerEvents="box-none"
        style={{
          alignItems: "center",
          bottom: 0,
          left: 0,
          paddingBottom: 18,
          paddingHorizontal: 20,
          paddingTop: 20,
          position: "absolute",
          right: 0,
        }}
      >
        <PrimaryButton variant="glass" onPress={save}>
          保存
        </PrimaryButton>
      </SafeAreaView>
    </View>
  );
}
