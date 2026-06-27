import { View } from "react-native";
import { Button as NativeButton, Host as NativeHost } from "@expo/ui/swift-ui";
import {
  accessibilityLabel as nativeAccessibilityLabel,
  buttonStyle,
  controlSize,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import {
  toolbarButtonGap,
  type CalendarPalette,
} from "@/components/calendar/calendar-utils";

export function CalendarChrome({
  leadingLabel,
  onGoToCurrentMonth,
  onLeadingPress,
  onOpenSearch,
  onToggleYearMonth,
  palette,
  showTodayButton,
}: {
  leadingLabel: string;
  onGoToCurrentMonth: () => void;
  onLeadingPress: () => void;
  onOpenSearch: () => void;
  onToggleYearMonth: () => void;
  palette: CalendarPalette;
  showTodayButton: boolean;
}) {
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 16,
        paddingTop: 4,
      }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          minHeight: 44,
        }}
      >
        <NativeToolbarButton
          label={leadingLabel}
          onPress={onLeadingPress}
          palette={palette}
          systemImage="chevron.left"
        />
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: toolbarButtonGap,
          }}
        >
          <TodayToolbarButton
            isVisible={showTodayButton}
            onPress={onGoToCurrentMonth}
            palette={palette}
          />
          <IconToolbarButton
            accessibilityLabel="搜索课程"
            systemImage="magnifyingglass"
            onPress={onOpenSearch}
            palette={palette}
          />
          <IconToolbarButton
            accessibilityLabel="切换年月视图"
            systemImage="calendar"
            onPress={onToggleYearMonth}
            palette={palette}
          />
        </View>
      </View>
    </View>
  );
}

function TodayToolbarButton({
  isVisible,
  onPress,
  palette,
}: {
  isVisible: boolean;
  onPress: () => void;
  palette: CalendarPalette;
}) {
  return (
    <View
      pointerEvents={isVisible ? "auto" : "none"}
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <NativeToolbarButton
        label="今天"
        onPress={onPress}
        palette={palette}
      />
    </View>
  );
}

function IconToolbarButton({
  accessibilityLabel,
  onPress,
  palette,
  systemImage,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  palette: CalendarPalette;
  systemImage: "calendar" | "magnifyingglass";
}) {
  return (
    <NativeHost matchContents>
      <NativeButton
        label={accessibilityLabel}
        modifiers={[
          buttonStyle("glass"),
          controlSize("regular"),
          tint(palette.red),
          labelStyle("iconOnly"),
          nativeAccessibilityLabel(accessibilityLabel),
        ]}
        onPress={onPress}
        systemImage={systemImage}
      />
    </NativeHost>
  );
}

function NativeToolbarButton({
  label,
  onPress,
  palette,
  systemImage,
}: {
  label: string;
  onPress: () => void;
  palette: CalendarPalette;
  systemImage?: "calendar" | "chevron.left" | "magnifyingglass";
}) {
  return (
    <NativeHost matchContents>
      <NativeButton
        label={label}
        modifiers={[
          buttonStyle("glass"),
          controlSize("regular"),
          tint(palette.red),
        ]}
        onPress={onPress}
        systemImage={systemImage}
      />
  </NativeHost>
  );
}
