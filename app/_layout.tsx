import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { bootstrapApp } from "@/bootstrap";
import { HeaderCreateMenu } from "@/components/header-create-menu";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import {
  getPendingLessonBadgeCount,
  subscribePendingLessonBadgeCount,
  syncPendingLessonBadge,
} from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { useTheme } from "@/theme";

const splashImages = {
  dark: require("../assets/images/splash-dark.png"),
  light: require("../assets/images/splash-light.png"),
};
const SPLASH_PULSE_DURATION = 1400;
const SPLASH_PULSE_SCALE = 0.052;
const SPLASH_PULSE_OFFSET_Y = -14;

SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn("Failed to keep splash screen visible", error);
});
SplashScreen.setOptions({ duration: 180, fade: true });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [pendingHeaderCount, setPendingHeaderCount] = useState(0);
  const [confirmingPendingLessons, setConfirmingPendingLessons] =
    useState(false);
  const splashPulse = useSharedValue(0);
  const splashImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + splashPulse.value * SPLASH_PULSE_SCALE },
      { translateY: splashPulse.value * SPLASH_PULSE_OFFSET_Y },
    ],
  }));
  const loadPendingHeaderCount = useCallback(async () => {
    try {
      setPendingHeaderCount(await getPendingLessonBadgeCount());
    } catch (error) {
      console.warn("Failed to load pending count", error);
    }
  }, []);
  const confirmPendingLessons = useCallback(async (lessonIds: string[]) => {
    setConfirmingPendingLessons(true);
    try {
      const confirmedCount =
        await lessonRepository.confirmManyWithDefaultAmounts(lessonIds);
      await syncLessonNotifications();
      await syncPendingLessonBadge();
      Alert.alert("确认完成", `已确认 ${confirmedCount} 节课程。`);
    } catch (error) {
      Alert.alert(
        "确认失败",
        error instanceof Error ? error.message : "请稍后再试。",
      );
    } finally {
      setConfirmingPendingLessons(false);
    }
  }, []);
  const confirmAllPendingLessons = useCallback(async () => {
    if (confirmingPendingLessons) return;

    try {
      await lessonRepository.refreshPendingStatuses();
      const lessons = await lessonRepository.findPendingLessons();
      const lessonIds = lessons.map((lesson) => lesson.id);
      setPendingHeaderCount(lessonIds.length);

      if (lessonIds.length === 0) {
        Alert.alert("没有待确认课程", "当前页面没有需要确认的课程。");
        return;
      }

      Alert.alert(
        "确认全部课程",
        `将按当前金额确认当前页面的 ${lessonIds.length} 节课程。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "全部确认",
            onPress: () => {
              void confirmPendingLessons(lessonIds);
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "确认失败",
        error instanceof Error ? error.message : "请稍后再试。",
      );
    }
  }, [confirmPendingLessons, confirmingPendingLessons]);
  const headerTitle = getHeaderTitle(pathname);
  const headerLeft = getHeaderLeft(pathname);
  const extra = getHeaderExtra(
    pathname,
    pendingHeaderCount,
    confirmingPendingLessons,
    confirmAllPendingLessons,
  );
  const headerCommonOptions: any = {
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    headerBackVisible: true,
    headerTitleAlign: "left",
    headerTitleStyle: {
      color: theme.colors.text,
      fontSize: 19,
      fontWeight: "500",
    },
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.text,
    headerRightContainerStyle: {
      paddingRight: 4,
    },
  };
  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch((error) => {
      console.warn("Failed to hide splash screen", error);
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      bootstrapApp(),
      new Promise((resolve) => setTimeout(resolve, 1100)),
    ])
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((error) => {
        console.warn("Failed to bootstrap app", error);
        if (mounted) {
          setBootstrapError(
            error instanceof Error ? error.message : "应用初始化失败，请重试。",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (ready) {
      cancelAnimation(splashPulse);
      splashPulse.value = 0;
      return;
    }

    splashPulse.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: SPLASH_PULSE_DURATION,
          easing: Easing.linear,
        }),
        withTiming(0, {
          duration: SPLASH_PULSE_DURATION,
          easing: Easing.linear,
        }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(splashPulse);
    };
  }, [ready, splashPulse]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === "string") {
          router.push(url as never);
        }
      },
    );

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!ready) return;

    const timer = setTimeout(loadPendingHeaderCount, 0);
    const unsubscribe =
      subscribePendingLessonBadgeCount(setPendingHeaderCount);

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [loadPendingHeaderCount, pathname, ready]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View
          onLayout={hideNativeSplash}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.scheme === "dark" ? "#101419" : "#F7FAFC",
            overflow: "hidden",
          }}
        >
          <Animated.Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={
              theme.scheme === "dark" ? splashImages.dark : splashImages.light
            }
            style={[
              {
                bottom: 0,
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
                height: "100%",
                width: "100%",
              },
              splashImageStyle,
            ]}
          />
          {bootstrapError ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor:
                  theme.scheme === "dark"
                    ? "rgba(16, 20, 25, 0.86)"
                    : "rgba(255, 255, 255, 0.86)",
                borderCurve: "continuous",
                borderRadius: 24,
                gap: 12,
                marginHorizontal: 24,
                paddingHorizontal: 24,
                paddingVertical: 22,
              }}
            >
              <Text
                selectable
                style={{
                  color: theme.colors.text,
                  fontSize: 17,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                初始化失败
              </Text>
              <Text
                selectable
                style={{
                  color: theme.colors.muted,
                  fontSize: 14,
                  lineHeight: 20,
                  textAlign: "center",
                }}
              >
                {bootstrapError}
              </Text>
              <Pressable
                onPress={() => {
                  setReady(false);
                  setBootstrapError(null);
                  setBootstrapAttempt((value) => value + 1);
                }}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.primary,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  opacity: pressed ? 0.72 : 1,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                })}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  重试
                </Text>
              </Pressable>
            </View>
          ) : null}
          <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ActionSheetProvider>
        <View onLayout={hideNativeSplash} style={{ flex: 1 }}>
          <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
          <Stack>
            <Stack.Screen
              name="(tabs)"
              options={{
                ...headerCommonOptions,
                headerShown: true,
                headerBackVisible: false,
                headerTitle,
                headerLeft: () => headerLeft,
                headerRight: () => extra,
              }}
            />
            <Stack.Screen
              name="calendar"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="lessons/create"
              options={{
                presentation: "modal",
                title: "新增课程",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="lessons/[id]"
              options={{
                title: "课程详情",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="lessons/[id]/confirm"
              options={{
                presentation: "modal",
                title: "确认金额",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="import/index"
              options={{
                presentation: "modal",
                title: "导入课表",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="import/preview"
              options={{
                title: "预览课表",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="settings/appearance"
              options={{
                title: "外观",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="settings/theme-color"
              options={{
                title: "主题色",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="settings/defaults"
              options={{
                title: "课程设置",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="settings/notifications"
              options={{
                title: "通知",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="settings/privacy"
              options={{
                title: "隐私与数据",
                ...headerCommonOptions,
              }}
            />
            <Stack.Screen
              name="settings/about"
              options={{
                title: "关于",
                ...headerCommonOptions,
              }}
            />
          </Stack>
        </View>
      </ActionSheetProvider>
    </SafeAreaProvider>
  );
}

function getHeaderTitle(pathname: string) {
  if (pathname.startsWith("/pending")) return "待确认";
  if (pathname.startsWith("/statistics")) return "统计";
  if (pathname.startsWith("/settings")) return "设置";
  return "课时记";
}

function getHeaderLeft(pathname: string) {
  if (pathname !== "/") return null;
  return <HeaderCalendarButton />;
}

function getHeaderExtra(
  pathname: string,
  pendingCount: number,
  confirming: boolean,
  onConfirmAllPending: () => void,
) {
  if (pathname.startsWith("/pending")) {
    if (pendingCount === 0) return null;
    return (
      <HeaderConfirmAllPendingButton
        confirming={confirming}
        onPress={onConfirmAllPending}
      />
    );
  }
  if (pathname !== "/") return null;
  return <HeaderCreateMenu />;
}

function HeaderConfirmAllPendingButton({
  confirming,
  onPress,
}: {
  confirming: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel="确认全部待确认课程"
      accessibilityRole="button"
      disabled={confirming}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 18,
        height: 36,
        justifyContent: "center",
        opacity: confirming ? 0.36 : pressed ? 0.55 : 1,
        width: 36,
      })}
    >
      <Ionicons
        name={confirming ? "hourglass-outline" : "checkmark-done-outline"}
        size={23}
        color={theme.colors.primary}
      />
    </Pressable>
  );
}

function HeaderCalendarButton() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel="打开日历"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => router.push("/calendar")}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 18,
        height: 36,
        justifyContent: "center",
        opacity: pressed ? 0.55 : 1,
        width: 36,
      })}
    >
      <Ionicons name="calendar-outline" size={23} color={theme.colors.text} />
    </Pressable>
  );
}
