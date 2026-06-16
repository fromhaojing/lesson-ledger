import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { bootstrapApp } from "@/bootstrap";
import { HeaderCreateMenu } from "@/components/header-create-menu";
import { useTheme } from "@/theme";

const splashLogos = {
  dark: require("../assets/images/icon-dark.png"),
  light: require("../assets/images/icon.png")
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const headerTitle = getHeaderTitle(pathname);
  const extra = getHeaderExtra(pathname);
  const headerCommonOptions: any = {
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    headerBackVisible: true,
    headerTitleAlign: "left",
    headerTitleStyle: {
      color: theme.colors.text,
      fontSize: 19,
      fontWeight: "500"
    },
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.text,
    headerRightContainerStyle: {
      paddingRight: 4
    }
  };

  useEffect(() => {
    let mounted = true;

    Promise.all([
      bootstrapApp(),
      new Promise((resolve) => setTimeout(resolve, 1100))
    ])
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((error) => {
        console.warn("Failed to bootstrap app", error);
        if (mounted) {
          setBootstrapError(error instanceof Error ? error.message : "应用初始化失败，请重试。");
        }
      });

    return () => {
      mounted = false;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string") {
        router.push(url as never);
      }
    });

    return () => subscription.remove();
  }, [router]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.background
          }}
        >
          <View style={{ alignItems: "center", gap: 16 }}>
            <View
              style={{
                borderCurve: "continuous",
                borderRadius: 28,
                height: 108,
                overflow: "hidden",
                width: 108
              }}
            >
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="课时记 Logo"
                source={theme.scheme === "dark" ? splashLogos.dark : splashLogos.light}
                style={{ height: "100%", width: "100%" }}
                resizeMode="contain"
              />
            </View>
            {bootstrapError ? (
              <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24 }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600", textAlign: "center" }}>
                  初始化失败
                </Text>
                <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" }}>
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
                    paddingVertical: 12
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>重试</Text>
                </Pressable>
              </View>
            ) : (
              <ActivityIndicator color={theme.colors.primary} />
            )}
          </View>
          <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ActionSheetProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
          <Stack>
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: true,
              headerTitle,
              headerRight: () => extra,
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="lessons/create"
            options={{
              presentation: "modal",
              title: "新增课程",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="lessons/[id]"
            options={{
              title: "课程详情",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="lessons/[id]/confirm"
            options={{
              presentation: "modal",
              title: "确认金额",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="import/index"
            options={{
              presentation: "modal",
              title: "导入课表",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="import/preview"
            options={{
              title: "预览课表",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="settings/appearance"
            options={{
              title: "外观",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="settings/theme-color"
            options={{
              title: "主题色",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="settings/defaults"
            options={{
              title: "课程默认值",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="settings/notifications"
            options={{
              title: "通知",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="settings/privacy"
            options={{
              title: "隐私与数据",
              ...headerCommonOptions
            }}
          />
          <Stack.Screen
            name="settings/about"
            options={{
              title: "关于",
              ...headerCommonOptions
            }}
          />
          </Stack>
        </View>
      </ActionSheetProvider>
    </SafeAreaProvider>
  );
}

function getHeaderTitle(pathname: string) {
  if (pathname.startsWith("/calendar")) return "日历";
  if (pathname.startsWith("/pending")) return "待确认";
  if (pathname.startsWith("/statistics")) return "统计";
  if (pathname.startsWith("/settings")) return "设置";
  return "课时记";
}

function getHeaderExtra(pathname: string) {
  if (pathname !== "/") return null;
  return <HeaderCreateMenu />;
}
