import dayjs from "dayjs";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  buildYearMonths,
  type CalendarPalette,
  type LessonGroup,
  type YearMonth,
} from "@/components/calendar/calendar-utils";
import { MonthCalendarSnapshot } from "@/components/calendar/month-agenda-transition";

export type CalendarModeTransitionDirection = "monthToYear" | "yearToMonth";

export function CalendarModeTransitionOverlay({
  availableHeight,
  bottomInset,
  contentWidth,
  currentToday,
  direction,
  lessonsByDate,
  month,
  monthAvailableHeight,
  onRest,
  palette,
  selectedDate,
  transitionId,
  year,
}: {
  availableHeight: number;
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  direction: CalendarModeTransitionDirection;
  lessonsByDate: LessonGroup;
  month: string;
  monthAvailableHeight: number;
  onRest: (transitionId: number) => void;
  palette: CalendarPalette;
  selectedDate: string;
  transitionId: number;
  year: number;
}) {
  const cellWidth = contentWidth / 7;
  const cellHeight = Math.max(92, Math.min(112, monthAvailableHeight / 6.4));
  const isOpeningYear = direction === "monthToYear";
  const monthOrigin = useMemo(
    () =>
      getYearMonthOrigin({
        availableHeight,
        contentWidth,
        month,
      }),
    [availableHeight, contentWidth, month],
  );
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(onRest)(transitionId);
      },
    );
  }, [onRest, progress, transitionId]);

  const yearLayerStyle = useAnimatedStyle(() => {
    const opacity = isOpeningYear
      ? interpolate(progress.value, [0, 0.16, 1], [0.08, 0.9, 1], "clamp")
      : interpolate(progress.value, [0, 0.74, 1], [1, 0.42, 0.12], "clamp");
    const scale = isOpeningYear
      ? interpolate(progress.value, [0, 1], [1.045, 1], "clamp")
      : interpolate(progress.value, [0, 1], [1, 1.045], "clamp");
    const translateY = isOpeningYear
      ? interpolate(progress.value, [0, 1], [12, 0], "clamp")
      : interpolate(progress.value, [0, 1], [0, 12], "clamp");

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const monthPanelPositionStyle = useAnimatedStyle(() => {
    const startTranslateX = monthOrigin.centerX - contentWidth / 2;
    const startTranslateY = monthOrigin.centerY - availableHeight / 2;
    const opacity = isOpeningYear
      ? interpolate(progress.value, [0, 0.88, 1], [1, 1, 0], "clamp")
      : interpolate(progress.value, [0, 0.08, 1], [0, 1, 1], "clamp");
    const translateX = isOpeningYear
      ? interpolate(progress.value, [0, 1], [0, startTranslateX], "clamp")
      : interpolate(progress.value, [0, 1], [startTranslateX, 0], "clamp");
    const translateY = isOpeningYear
      ? interpolate(progress.value, [0, 1], [0, startTranslateY], "clamp")
      : interpolate(progress.value, [0, 1], [startTranslateY, 0], "clamp");

    return {
      opacity,
      transform: [{ translateX }, { translateY }],
    };
  });

  const monthPanelScaleStyle = useAnimatedStyle(() => {
    const scale = isOpeningYear
      ? interpolate(progress.value, [0, 1], [1, monthOrigin.scale], "clamp")
      : interpolate(progress.value, [0, 1], [monthOrigin.scale, 1], "clamp");
    const borderRadius = isOpeningYear
      ? interpolate(progress.value, [0, 0.72, 1], [0, 18, 26], "clamp")
      : interpolate(progress.value, [0, 0.28, 1], [26, 18, 0], "clamp");

    return {
      borderRadius,
      transform: [{ scale }],
    };
  });

  return (
    <View
      pointerEvents="none"
      style={{
        backgroundColor: palette.background,
        bottom: 0,
        left: 0,
        overflow: "hidden",
        position: "absolute",
        right: 0,
        top: 0,
      }}
    >
      <Animated.View
        style={[
          layerStyle,
          {
            backgroundColor: palette.background,
            height: availableHeight,
            width: contentWidth,
          },
          yearLayerStyle,
        ]}
      >
        <YearCalendarSnapshot
          bottomInset={bottomInset}
          contentWidth={contentWidth}
          currentToday={currentToday}
          lessonsByDate={lessonsByDate}
          palette={palette}
          selectedDate={selectedDate}
          year={year}
        />
      </Animated.View>

      <Animated.View
        style={[
          layerStyle,
          {
            backgroundColor: palette.background,
            height: availableHeight,
            width: contentWidth,
          },
          monthPanelPositionStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              backgroundColor: palette.background,
              height: availableHeight,
              overflow: "hidden",
              width: contentWidth,
            },
            monthPanelScaleStyle,
          ]}
        >
          <MonthCalendarSnapshot
            cellHeight={cellHeight}
            cellWidth={cellWidth}
            currentToday={currentToday}
            lessonsByDate={lessonsByDate}
            month={month}
            palette={palette}
            selectedDate={selectedDate}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const layerStyle = {
  left: 0,
  overflow: "hidden" as const,
  position: "absolute" as const,
  top: 0,
};

function getYearMonthOrigin({
  availableHeight,
  contentWidth,
  month,
}: {
  availableHeight: number;
  contentWidth: number;
  month: string;
}) {
  const horizontalPadding = 14;
  const columnGap = 12;
  const monthWidth = (contentWidth - horizontalPadding * 2 - columnGap * 2) / 3;
  const miniMonthHeight = Math.max(126, Math.min(146, contentWidth * 0.36));
  const monthIndex = Math.max(0, dayjs(`${month}-01`).month());
  const row = Math.floor(monthIndex / 3);
  const column = monthIndex % 3;
  const sectionTitleHeight = 54;
  const rowGap = 24;
  const centerX =
    horizontalPadding + column * (monthWidth + columnGap) + monthWidth / 2;
  const centerY =
    sectionTitleHeight +
    row * (miniMonthHeight + rowGap) +
    miniMonthHeight / 2;

  return {
    centerX,
    centerY: Math.max(48, Math.min(availableHeight - 48, centerY)),
    scale: Math.max(
      0.18,
      Math.min(0.32, Math.min(monthWidth / contentWidth, 0.24)),
    ),
  };
}

function YearCalendarSnapshot({
  bottomInset,
  contentWidth,
  currentToday,
  lessonsByDate,
  palette,
  selectedDate,
  year,
}: {
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  lessonsByDate: LessonGroup;
  palette: CalendarPalette;
  selectedDate: string;
  year: number;
}) {
  const horizontalPadding = 14;
  const columnGap = 12;
  const monthWidth = (contentWidth - horizontalPadding * 2 - columnGap * 2) / 3;
  const miniMonthHeight = Math.max(126, Math.min(146, contentWidth * 0.36));
  const months = useMemo(
    () => buildYearMonths(year, selectedDate, currentToday, lessonsByDate),
    [currentToday, lessonsByDate, selectedDate, year],
  );

  return (
    <View
      style={{
        backgroundColor: palette.background,
        paddingBottom: bottomInset + 18,
        width: contentWidth,
      }}
    >
      <Text
        style={{
          color: palette.text,
          fontSize: 34,
          fontWeight: "700",
          lineHeight: 42,
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
      >
        {year}年
      </Text>
      <View
        style={{
          columnGap,
          flexDirection: "row",
          flexWrap: "wrap",
          paddingHorizontal: horizontalPadding,
          rowGap: 24,
        }}
      >
        {months.map((month) => (
          <YearMiniMonthSnapshot
            key={month.month}
            height={miniMonthHeight}
            month={month}
            palette={palette}
            width={monthWidth}
          />
        ))}
      </View>
    </View>
  );
}

function YearMiniMonthSnapshot({
  height,
  month,
  palette,
  width,
}: {
  height: number;
  month: YearMonth;
  palette: CalendarPalette;
  width: number;
}) {
  const cellWidth = width / 7;

  return (
    <View style={{ backgroundColor: palette.background, gap: 6, height, width }}>
      <Text
        style={{
          color:
            month.isSelectedMonth || month.isCurrentMonth
              ? palette.red
              : palette.text,
          fontSize: 20,
          fontWeight: "700",
        }}
      >
        {dayjs(`${month.month}-01`).format("M月")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {month.cells.map((cell) => (
          <View
            key={cell.dateText}
            style={{
              alignItems: "center",
              height: 17,
              justifyContent: "center",
              width: cellWidth,
            }}
          >
            {cell.inCurrentMonth ? (
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: cell.isToday ? palette.red : "transparent",
                  borderRadius: 999,
                  height: 15,
                  justifyContent: "center",
                  width: 15,
                }}
              >
                <Text
                  style={{
                    color: cell.isToday ? "#FFFFFF" : palette.miniText,
                    fontSize: 9,
                    fontVariant: ["tabular-nums"],
                    fontWeight: cell.isToday ? "700" : "500",
                    lineHeight: 12,
                  }}
                >
                  {Number(cell.dateText.slice(8, 10))}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
        {month.cells.map((cell) => (
          <View
            key={`${cell.dateText}-dot`}
            style={{
              alignItems: "center",
              height: 4,
              width: cellWidth,
            }}
          >
            {cell.hasLessons && cell.inCurrentMonth ? (
              <View
                style={{
                  backgroundColor: palette.red,
                  borderRadius: 999,
                  height: 3,
                  opacity: 0.85,
                  width: 3,
                }}
              />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
