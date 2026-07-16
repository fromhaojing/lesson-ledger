import { useCallback, useState } from "react";
import { Alert, Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";

import {
  FooterText,
  SettingsActionRow,
  SettingsDetail,
  SettingsGroup,
  SwitchRow,
} from "@/components/settings-ui";
import {
  getNotificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
  syncLessonNotifications,
} from "@/modules/notifications/notification.service";

export function NotificationSettingsScreen() {
  const [appEnabled, setAppEnabled] = useState(true);
  const [systemGranted, setSystemGranted] = useState(true);

  const load = useCallback(async () => {
    const current = await Notifications.getPermissionsAsync();
    setAppEnabled(await getNotificationsEnabled());
    setSystemGranted(current.granted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function enableNotification() {
    await setNotificationsEnabled(true);
    setAppEnabled(true);

    const granted = await requestNotificationPermission();
    if (!granted) {
      setSystemGranted(false);
      Alert.alert(
        "系统通知未开启",
        "需要在 iOS 设置里允许课时记发送通知，课程提醒才会生效。",
        [
          { text: "稍后", style: "cancel" },
          { text: "去设置", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    setSystemGranted(true);
    await syncLessonNotifications();
  }

  function toggleNotification(nextValue: boolean) {
    if (nextValue) {
      enableNotification();
      return;
    }

    Alert.alert(
      "关闭课程提醒？",
      "关闭后，已安排的课程结束提醒会被取消。你可以随时回来重新开启。",
      [
        {
          text: "取消",
          style: "cancel",
          onPress: () => setAppEnabled(true),
        },
        {
          text: "关闭",
          style: "destructive",
          onPress: async () => {
            await setNotificationsEnabled(false);
            setAppEnabled(false);
          },
        },
      ],
    );
  }

  const enabled = appEnabled && systemGranted;

  return (
    <SettingsDetail>
      <SettingsGroup title="提醒">
        <SwitchRow
          title="课程结束提醒"
          value={enabled}
          onValueChange={toggleNotification}
        />
      </SettingsGroup>
      <SettingsGroup title="系统">
        <SettingsActionRow
          title="系统通知权限"
          value={systemGranted ? "已允许" : "未允许"}
          onPress={() => Linking.openSettings()}
        />
      </SettingsGroup>
      <FooterText>
        此开关会同时参考 iOS
        系统通知权限。系统通知未允许时，课时记不会自行显示为可提醒状态。
      </FooterText>
    </SettingsDetail>
  );
}
