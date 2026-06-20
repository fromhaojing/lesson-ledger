import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Linking,
  Pressable,
  Switch,
  Text,
  View,
  type ColorValue,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import {
  clearAllUserData,
  exportDataToExcel,
  getLocalDataSize,
} from "@/modules/data/data-management.service";
import {
  REMINDER_MINUTES_MAX,
  REMINDER_MINUTES_MIN,
  REMINDER_MINUTES_STEP,
  getNotificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
  syncLessonNotifications,
} from "@/modules/notifications/notification.service";
import { getSetting, setSetting } from "@/modules/settings/settings.repository";
import {
  defaultThemeColor,
  normalizeThemeColor,
  setThemeColor,
  setThemeMode,
  themeColorPresets,
  type ThemeColorKey,
  type ThemeMode,
  useTheme,
  useThemeColor,
  useThemeMode,
} from "@/theme";
import {
  DEFAULT_NUMBER_WHEEL_MAX,
  DEFAULT_NUMBER_WHEEL_MIN,
  DEFAULT_NUMBER_WHEEL_STEP,
  NumberWheelField,
  PrimaryButton,
  normalizeNumberWheelValue,
} from "@/components/ui";
import { SafeAreaView } from "react-native-safe-area-context";

type ReminderTiming = "before" | "after";

const APP_VERSION = "1.0.0";

function normalizeDefaultAmount(value: string) {
  return normalizeNumberWheelValue(
    value,
    DEFAULT_NUMBER_WHEEL_MIN,
    DEFAULT_NUMBER_WHEEL_MAX,
    DEFAULT_NUMBER_WHEEL_STEP,
  );
}

function normalizeReminderMinutes(value: string) {
  return normalizeNumberWheelValue(
    value,
    REMINDER_MINUTES_MIN,
    REMINDER_MINUTES_MAX,
    REMINDER_MINUTES_STEP,
  );
}

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

export function AppearanceSettingsScreen() {
  const themeMode = useThemeMode();

  async function changeThemeMode(mode: ThemeMode) {
    setThemeMode(mode);
    await setSetting("theme_mode", mode);
  }

  return (
    <SettingsDetail>
      <SettingsGroup title="显示">
        <ChoiceRow
          title="跟随系统"
          selected={themeMode === "unspecified"}
          onPress={() => changeThemeMode("unspecified")}
        />
        <ChoiceRow
          title="浅色"
          selected={themeMode === "light"}
          onPress={() => changeThemeMode("light")}
        />
        <ChoiceRow
          title="深色"
          selected={themeMode === "dark"}
          onPress={() => changeThemeMode("dark")}
        />
      </SettingsGroup>
      <FooterText>选择跟随系统后，课时记会使用 iOS 当前的外观设置。</FooterText>
    </SettingsDetail>
  );
}

export function ThemeColorSettingsScreen() {
  const themeColor = useThemeColor();

  async function changeThemeColor(color: ThemeColorKey) {
    setThemeColor(color);
    await setSetting("theme_color", color);
  }

  return (
    <SettingsDetail>
      <SettingsGroup title="主题色">
        {themeColorPresets.map((preset) => (
          <ColorChoiceRow
            key={preset.key}
            color={preset.light.primary}
            onPress={() => changeThemeColor(preset.key)}
            selected={themeColor === preset.key}
            title={preset.label}
          />
        ))}
      </SettingsGroup>
      <FooterText>
        主题色会用于底部标签、按钮、日历选中态和页面强调色，并保存在本机。
      </FooterText>
    </SettingsDetail>
  );
}

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

export function PrivacySettingsScreen() {
  const [storageSize, setStorageSize] = useState("计算中");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStorageSize(formatBytes(await getLocalDataSize()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function exportData() {
    setBusy(true);
    try {
      await exportDataToExcel();
    } catch (error) {
      Alert.alert(
        "导出失败",
        error instanceof Error ? error.message : "请稍后再试。",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmClearData() {
    Alert.alert(
      "清除课程数据？",
      "这会删除本机保存的课程和导入记录，保留外观、通知和课程默认值。建议先导出备份。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "继续",
          style: "destructive",
          onPress: confirmClearDataAgain,
        },
      ],
    );
  }

  function confirmClearDataAgain() {
    Alert.alert(
      "再次确认清除",
      "清除后无法恢复。确定要删除课时记在本机保存的课程和导入记录吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清除课程数据",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await clearAllUserData();
              await load();
              Alert.alert(
                "已清除",
                "课程和导入记录已经清除，外观、通知和课程默认值已保留。",
              );
            } catch (error) {
              Alert.alert(
                "清除失败",
                error instanceof Error ? error.message : "请稍后再试。",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SettingsDetail>
      <SettingsGroup title="数据">
        <InfoRow title="存储位置" value="仅保存在这台设备" />
        <InfoRow title="本地数据占用" value={storageSize} />
      </SettingsGroup>
      <SettingsGroup title="管理">
        <SettingsActionRow
          title="导出数据"
          value={busy ? "处理中" : "Excel"}
          onPress={exportData}
        />
        <SettingsActionRow
          title="清除课程数据"
          value=""
          destructive
          onPress={confirmClearData}
        />
      </SettingsGroup>
      <FooterText>
        当前版本使用本地 SQLite
        数据库存放课程、金额、设置和导入记录。清除课程数据会保留设置；删除 App
        会同时删除这些本地数据。
      </FooterText>
    </SettingsDetail>
  );
}

export function AboutSettingsScreen() {
  return (
    <SettingsDetail>
      <SettingsGroup title="应用">
        <InfoRow title="名称" value="课时记" />
        <InfoRow title="版本" value={APP_VERSION} />
      </SettingsGroup>
      <FooterText>
        课时记用于在本机记录课程、学生、课时金额和提醒设置，帮助你快速查看待确认课程与收入统计。
      </FooterText>
    </SettingsDetail>
  );
}

function SettingsDetail({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <SafeAreaScrollView
      contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    >
      {children}
    </SafeAreaScrollView>
  );
}

function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const theme = useTheme();
  const childArray = Children.toArray(children);

  return (
    <View style={{ gap: 5, marginBottom: title ? 0 : 14 }}>
      {title ? (
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 13,
            paddingHorizontal: 16,
            textTransform: "uppercase",
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderCurve: "continuous",
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {childArray.map((child, index) =>
          isValidElement<{ showDivider?: boolean }>(child) &&
          child.type === SettingsRow
            ? cloneElement(child, {
                showDivider: index < childArray.length - 1,
              })
            : child,
        )}
      </View>
    </View>
  );
}

function SettingsRow({
  icon,
  iconBackground,
  onPress,
  showDivider = true,
  title,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: ColorValue;
  onPress: () => void;
  showDivider?: boolean;
  title: string;
  value: string;
}) {
  const theme = useTheme();
  const separatorColor = theme.colors.line;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 46,
        paddingLeft: 16,
        paddingRight: 12,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: iconBackground,
          borderCurve: "continuous",
          borderRadius: 7,
          height: 29,
          justifyContent: "center",
          width: 29,
        }}
      >
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </View>
      <View
        style={{
          alignItems: "center",
          borderBottomColor: separatorColor,
          borderBottomWidth: showDivider ? 1 : 0,
          flex: 1,
          flexDirection: "row",
          gap: 8,
          marginLeft: 12,
          minHeight: 46,
        }}
      >
        <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.muted, fontSize: 17, maxWidth: 190 }}
        >
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />
      </View>
    </Pressable>
  );
}

function ChoiceRow({
  onPress,
  selected,
  title,
}: {
  onPress: () => void;
  selected: boolean;
  title: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 46,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
        {title}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" color={theme.colors.primary} size={22} />
      ) : null}
    </Pressable>
  );
}

function ColorChoiceRow({
  color,
  onPress,
  selected,
  title,
}: {
  color: string;
  onPress: () => void;
  selected: boolean;
  title: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 50,
        paddingHorizontal: 16,
      })}
    >
      <View
        style={{
          backgroundColor: color,
          borderColor: "rgba(0, 0, 0, 0.08)",
          borderCurve: "continuous",
          borderRadius: 10,
          borderWidth: 1,
          height: 28,
          marginRight: 12,
          width: 28,
        }}
      />
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
        {title}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" color={theme.colors.primary} size={22} />
      ) : null}
    </Pressable>
  );
}

function SettingsActionRow({
  destructive,
  onPress,
  title,
  value,
}: {
  destructive?: boolean;
  onPress: () => void;
  title: string;
  value: string;
}) {
  const theme = useTheme();
  const titleColor = destructive ? theme.colors.danger : theme.colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 46,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ color: titleColor, flex: 1, fontSize: 17 }}>{title}</Text>
      <Text style={{ color: theme.colors.muted, fontSize: 17, marginRight: 8 }}>
        {value}
      </Text>
      {value ? (
        <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />
      ) : null}
    </Pressable>
  );
}

function SwitchRow({
  onValueChange,
  title,
  value,
}: {
  onValueChange: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        minHeight: 46,
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          flex: 1,
          fontSize: 17,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Switch
          value={value}
          onValueChange={onValueChange}
        />
      </View>
    </View>
  );
}

function InfoRow({ title, value }: { title: string; value: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        minHeight: 46,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.muted,
          flex: 1.2,
          fontSize: 17,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function FooterText({ children }: { children: string }) {
  const theme = useTheme();

  return (
    <Text
      style={{
        color: theme.colors.muted,
        fontSize: 13,
        lineHeight: 18,
        paddingHorizontal: 16,
      }}
    >
      {children}
    </Text>
  );
}

function themeModeLabel(mode: ThemeMode) {
  if (mode === "light") return "浅色";
  if (mode === "dark") return "深色";
  return "跟随系统";
}

function themeColorLabel(color: ThemeColorKey) {
  return (
    themeColorPresets.find(
      (preset) => preset.key === normalizeThemeColor(color),
    )?.label ??
    themeColorPresets.find((preset) => preset.key === defaultThemeColor)
      ?.label ??
    "珊瑚红"
  );
}

function reminderTimingLabel(timing: ReminderTiming) {
  return timing === "after" ? "结束后" : "结束前";
}

async function getReminderTimingSetting(): Promise<ReminderTiming> {
  const timing = await getSetting("remind_timing", "before");
  return timing === "after" ? "after" : "before";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function getNotificationStatusLabel() {
  const appEnabled = await getNotificationsEnabled();
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) return "系统未允许";
  return appEnabled ? "已开启" : "已关闭";
}
