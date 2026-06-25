import { View } from "react-native";
import { Button as NativeButton, Host as NativeHost } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";

import { toolbarButtonGap, type CalendarMode, type CalendarPalette } from "@/components/calendar/calendar-utils";

export function CalendarChrome({
  leadingLabel,
  mode,
  onGoToCurrentMonth,
  onLeadingPress,
  onOpenSearch,
  onToggleYearMonth,
  palette,
  showTodayButton,
}: {
  leadingLabel: string;
  mode: CalendarMode;
  onGoToCurrentMonth: () => void;
  onLeadingPress: () => void;
  onOpenSearch: () => void;
  onToggleYearMonth: () => void;
  palette: CalendarPalette;
  showTodayButton: boolean;
}) {
  const modeButtonLabel = mode === "year" ? "月" : "年";

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
        <View style={{ alignItems: "center", flexDirection: "row" }}>
          <TodayToolbarButton
            isVisible={showTodayButton}
            onPress={onGoToCurrentMonth}
            palette={palette}
          />
          <NativeToolbarButton
            label="搜索"
            onPress={onOpenSearch}
            palette={palette}
            systemImage="magnifyingglass"
          />
          <View pointerEvents="none" style={{ width: toolbarButtonGap }} />
          <NativeToolbarButton
            label={modeButtonLabel}
            onPress={onToggleYearMonth}
            palette={palette}
            systemImage="calendar"
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
    <>
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
      <View
        pointerEvents="none"
        style={[
          {
            width: toolbarButtonGap,
          },
          toolbarTransitionStyle,
        ]}
      />
    </>
  );
}

const toolbarTransitionStyle = {
  transitionDuration: "180ms",
  transitionProperty: "width",
  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
};

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
