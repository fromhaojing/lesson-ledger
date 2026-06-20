import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { usePathname } from "expo-router";

import { getPendingLessonBadgeCount } from "@/modules/notifications/badge.service";
import { useTheme } from "@/theme";
import { isLiquidGlassAvailable } from "@/utils/native-appearance";

export default function TabLayout() {
  const theme = useTheme();
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const liquidGlassAvailable = isLiquidGlassAvailable();

  const loadPendingCount = useCallback(async () => {
    try {
      setPendingCount(await getPendingLessonBadgeCount());
    } catch (error) {
      console.warn("Failed to load pending badge count", error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadPendingCount, 0);
    return () => clearTimeout(timer);
  }, [loadPendingCount, pathname]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadPendingCount();
      }
    });
    const timer = setInterval(loadPendingCount, 60 * 1000);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [loadPendingCount]);

  return (
    <NativeTabs
      backgroundColor={liquidGlassAvailable ? undefined : theme.colors.surface}
      blurEffect={liquidGlassAvailable ? undefined : "systemMaterial"}
      disableTransparentOnScrollEdge={!liquidGlassAvailable}
      shadowColor={liquidGlassAvailable ? undefined : theme.colors.line}
      tintColor={theme.colors.primary}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
        <NativeTabs.Trigger.Label>首页</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pending">
        <NativeTabs.Trigger.Icon
          sf={{ default: "tray", selected: "tray.fill" }}
          md="pending_actions"
        />
        <NativeTabs.Trigger.Label>待确认</NativeTabs.Trigger.Label>
        {pendingCount > 0 ? (
          <NativeTabs.Trigger.Badge>
            {String(pendingCount)}
          </NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="statistics">
        <NativeTabs.Trigger.Icon
          sf={{ default: "chart.bar", selected: "chart.bar.fill" }}
          md="bar_chart"
        />
        <NativeTabs.Trigger.Label>统计</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          md="settings"
        />
        <NativeTabs.Trigger.Label>设置</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
