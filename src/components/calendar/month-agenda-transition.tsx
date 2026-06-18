import dayjs from "dayjs";
import { useEffect, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  type AgendaSection,
  type CalendarPalette,
  type LessonGroup,
  type MonthCell,
  buildMonthCells,
  chunk,
  formatChineseCalendarDay,
  getAgendaSectionHeight,
  getLessonStatusMeta,
  getMonthSectionHeight,
  shiftMonth,
} from "@/components/calendar/calendar-utils";
import { WeekHeader } from "@/components/calendar/month-view";
import type { Lesson } from "@/modules/lessons/lesson.types";

export type MonthAgendaTransitionDirection = "agendaToMonth" | "monthToAgenda";

export function MonthAgendaTransitionOverlay({
  availableHeight,
  agendaSelectedDate,
  bottomInset,
  contentWidth,
  currentToday,
  direction,
  sections,
  lessonsByDate,
  month,
  monthAvailableHeight,
  onRest,
  palette,
  selectedDate,
  transitionId,
}: {
  availableHeight: number;
  agendaSelectedDate: string;
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  direction: MonthAgendaTransitionDirection;
  sections: AgendaSection[];
  lessonsByDate: LessonGroup;
  month: string;
  monthAvailableHeight: number;
  onRest: (transitionId: number) => void;
  palette: CalendarPalette;
  selectedDate: string;
  transitionId: number;
}) {
  const cellWidth = contentWidth / 7;
  const cellHeight = Math.max(92, Math.min(112, monthAvailableHeight / 6.4));
  const isOpeningAgenda = direction === "monthToAgenda";
  const progress = useSharedValue(0);
  const selectedOrigin = useMemo(
    () =>
      getSelectedDateOrigin({
        availableHeight,
        cellHeight,
        cellWidth,
        month,
        selectedDate,
      }),
    [availableHeight, cellHeight, cellWidth, month, selectedDate],
  );
  const visibleSections = useMemo(
    () =>
      getVisibleAgendaSections(
        sections,
        agendaSelectedDate,
        availableHeight,
        bottomInset,
      ),
    [agendaSelectedDate, availableHeight, bottomInset, sections],
  );

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: isOpeningAgenda ? 340 : 260,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(onRest)(transitionId);
      },
    );
  }, [isOpeningAgenda, onRest, progress, transitionId]);

  const monthAnimatedStyle = useAnimatedStyle(() => {
    const monthOpacity = isOpeningAgenda
      ? interpolate(progress.value, [0, 1], [1, 0.16])
      : interpolate(progress.value, [0, 1], [0.16, 1]);
    const monthTranslateY = isOpeningAgenda
      ? interpolate(progress.value, [0, 1], [0, -96])
      : interpolate(progress.value, [0, 1], [-96, 0]);
    const monthScale = isOpeningAgenda
      ? interpolate(progress.value, [0, 1], [1, 0.985])
      : interpolate(progress.value, [0, 1], [0.985, 1]);

    return {
      opacity: monthOpacity,
      transform: [{ translateY: monthTranslateY }, { scale: monthScale }],
    };
  });

  const agendaPanelPositionStyle = useAnimatedStyle(() => {
    const origin = selectedOrigin;
    const startTranslateX = origin.centerX - contentWidth / 2;
    const startTranslateY = origin.centerY - availableHeight / 2;
    const opacity = isOpeningAgenda
      ? interpolate(progress.value, [0, 0.08, 1], [0, 1, 1])
      : interpolate(progress.value, [0, 0.88, 1], [1, 1, 0]);
    const translateX = isOpeningAgenda
      ? interpolate(progress.value, [0, 1], [startTranslateX, 0])
      : interpolate(progress.value, [0, 1], [0, startTranslateX]);
    const translateY = isOpeningAgenda
      ? interpolate(progress.value, [0, 1], [startTranslateY, 0])
      : interpolate(progress.value, [0, 1], [0, startTranslateY]);

    return {
      opacity,
      transform: [{ translateX }, { translateY }],
    };
  });

  const agendaPanelScaleStyle = useAnimatedStyle(() => {
    const origin = selectedOrigin;
    const borderRadius = isOpeningAgenda
      ? interpolate(progress.value, [0, 0.72, 1], [160, 16, 0])
      : interpolate(progress.value, [0, 0.22, 1], [0, 16, 160]);
    const scale = isOpeningAgenda
      ? interpolate(progress.value, [0, 1], [origin.scale, 1])
      : interpolate(progress.value, [0, 1], [1, origin.scale]);

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
          monthLayerStyle,
          { backgroundColor: palette.background },
          monthAnimatedStyle,
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

      <Animated.View
        style={[
          agendaPanelBaseStyle,
          {
            height: availableHeight,
            width: contentWidth,
          },
          agendaPanelPositionStyle,
        ]}
      >
        <Animated.View
          style={[
            agendaPanelSurfaceStyle,
            {
              backgroundColor: palette.background,
              height: availableHeight,
              width: contentWidth,
            },
            agendaPanelScaleStyle,
          ]}
        >
          <View
            style={{
              minHeight: availableHeight,
              paddingBottom: bottomInset + 18,
              width: contentWidth,
            }}
          >
            {visibleSections.length > 0 ? (
              visibleSections.map((section, index) => (
                <AgendaSnapshotAnimatedItem
                  direction={direction}
                  index={index}
                  key={section.dateText}
                  progress={progress}
                >
                  <AgendaSnapshotSection
                    contentWidth={contentWidth}
                    currentToday={currentToday}
                    palette={palette}
                    section={section}
                  />
                </AgendaSnapshotAnimatedItem>
              ))
            ) : (
              <AgendaSnapshotAnimatedItem
                direction={direction}
                index={0}
                progress={progress}
              >
                <AgendaSnapshotEmpty palette={palette} />
              </AgendaSnapshotAnimatedItem>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const monthLayerStyle = {
  backgroundColor: "transparent",
  bottom: 0,
  left: 0,
  overflow: "hidden" as const,
  position: "absolute" as const,
  right: 0,
  top: 0,
};

const agendaPanelBaseStyle = {
  left: 0,
  position: "absolute" as const,
  top: 0,
};

const agendaPanelSurfaceStyle = {
  overflow: "hidden" as const,
};

function AgendaSnapshotAnimatedItem({
  children,
  direction,
  index,
  progress,
}: {
  children: ReactNode;
  direction: MonthAgendaTransitionDirection;
  index: number;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const start = Math.min(0.22, 0.07 + index * 0.012);
    const end = Math.min(0.48, start + 0.18);
    const leaveEnd = Math.min(0.2, 0.12 + index * 0.006);
    const opacity =
      direction === "monthToAgenda"
        ? interpolate(progress.value, [start, end], [0, 1], "clamp")
        : interpolate(progress.value, [0, leaveEnd], [1, 0], "clamp");
    const translateY =
      direction === "monthToAgenda"
        ? interpolate(progress.value, [start, end], [12, 0], "clamp")
        : interpolate(progress.value, [0, leaveEnd], [0, -6], "clamp");
    const scale =
      direction === "monthToAgenda"
        ? interpolate(progress.value, [start, end], [0.992, 1], "clamp")
        : interpolate(progress.value, [0, leaveEnd], [1, 0.994], "clamp");

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function getSelectedDateOrigin({
  availableHeight,
  cellHeight,
  cellWidth,
  month,
  selectedDate,
}: {
  availableHeight: number;
  cellHeight: number;
  cellWidth: number;
  month: string;
  selectedDate: string;
}) {
  const diameter = 40;
  const fallbackTop = Math.max(56, Math.min(availableHeight - diameter, 220));
  if (!selectedDate.startsWith(month)) {
    return {
      borderRadius: diameter / 2,
      centerX: cellWidth * 3.5,
      centerY: fallbackTop + diameter / 2,
      height: diameter,
      left: cellWidth * 3.5 - diameter / 2,
      scale: 0.12,
      top: fallbackTop,
      width: diameter,
    };
  }

  const monthDate = dayjs(`${month}-01`);
  const date = dayjs(selectedDate);
  const cellIndex = monthDate.day() + date.date() - 1;
  const row = Math.max(0, Math.floor(cellIndex / 7));
  const column = Math.max(0, Math.min(6, cellIndex % 7));
  const weekHeaderHeight = 26;
  const monthTitleHeight = 54;
  const cellTop = weekHeaderHeight + monthTitleHeight + row * cellHeight;

  return {
    borderRadius: diameter / 2,
    centerX: column * cellWidth + cellWidth / 2,
    centerY: Math.max(
      diameter / 2,
      Math.min(availableHeight - diameter / 2, cellTop + 25),
    ),
    height: diameter,
    left: column * cellWidth + cellWidth / 2 - diameter / 2,
    scale: Math.max(0.1, Math.min(0.16, (cellWidth / (cellWidth * 7)) * 1.35)),
    top: Math.max(0, Math.min(availableHeight - diameter, cellTop + 5)),
    width: diameter,
  };
}

function getVisibleAgendaSections(
  sections: AgendaSection[],
  agendaSelectedDate: string,
  availableHeight: number,
  bottomInset: number,
) {
  if (sections.length === 0) return [];

  const selectedIndex = sections.findIndex(
    (section) => section.dateText >= agendaSelectedDate,
  );
  let startIndex = selectedIndex >= 0 ? selectedIndex : sections.length - 1;
  let endIndex = startIndex;
  const targetHeight = Math.max(420, availableHeight + bottomInset + 160);
  const targetTopHeight = Math.min(
    Math.max(160, availableHeight * 0.42),
    targetHeight * 0.5,
  );
  let topHeight = 0;
  let measuredHeight = getAgendaSectionHeight(sections[startIndex]);

  while (
    startIndex > 0 &&
    topHeight < targetTopHeight &&
    endIndex - startIndex + 1 < 20
  ) {
    startIndex -= 1;
    const height = getAgendaSectionHeight(sections[startIndex]);
    topHeight += height;
    measuredHeight += height;
  }

  while (
    endIndex < sections.length - 1 &&
    measuredHeight < targetHeight &&
    endIndex - startIndex + 1 < 20
  ) {
    endIndex += 1;
    measuredHeight += getAgendaSectionHeight(sections[endIndex]);
  }

  while (
    startIndex > 0 &&
    measuredHeight < targetHeight &&
    endIndex - startIndex + 1 < 20
  ) {
    startIndex -= 1;
    measuredHeight += getAgendaSectionHeight(sections[startIndex]);
  }

  return sections.slice(startIndex, endIndex + 1);
}

function AgendaSnapshotSection({
  contentWidth,
  currentToday,
  palette,
  section,
}: {
  contentWidth: number;
  currentToday: string;
  palette: CalendarPalette;
  section: AgendaSection;
}) {
  return (
    <View
      style={{
        paddingLeft: 18,
        paddingRight: 18,
        width: contentWidth,
      }}
    >
      <View
        style={{
          alignItems: "center",
          borderBottomColor: palette.separator,
          borderBottomWidth: 0.5,
          flexDirection: "row",
          minHeight: 38,
        }}
      >
        <Text
          style={{
            color:
              section.dateText === currentToday ? palette.red : palette.text,
            flex: 1,
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          {section.title}
        </Text>
        <Text style={{ color: palette.secondaryText, fontSize: 15 }}>
          {section.subtitle}
        </Text>
      </View>

      {section.lessons.map((lesson) => (
        <AgendaSnapshotLessonRow
          key={lesson.id}
          lesson={lesson}
          palette={palette}
        />
      ))}
    </View>
  );
}

function AgendaSnapshotEmpty({ palette }: { palette: CalendarPalette }) {
  return (
    <View
      style={{
        minHeight: 220,
        justifyContent: "center",
        paddingHorizontal: 24,
      }}
    >
      <Text
        style={{
          color: palette.text,
          fontSize: 18,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        暂无课程
      </Text>
    </View>
  );
}

function AgendaSnapshotLessonRow({
  lesson,
  palette,
}: {
  lesson: Lesson;
  palette: CalendarPalette;
}) {
  const status = getLessonStatusMeta(lesson.status, palette);
  const meta =
    [lesson.grade, lesson.courseType].filter(Boolean).join(" · ") || "普通课程";

  return (
    <View
      style={{
        alignItems: "center",
        borderBottomColor: palette.separator,
        borderBottomWidth: 0.5,
        flexDirection: "row",
        minHeight: 58,
        paddingVertical: 8,
      }}
    >
      <View
        style={{ alignItems: "center", justifyContent: "center", width: 22 }}
      >
        <View
          style={{
            backgroundColor: status.color,
            borderRadius: 999,
            height: 10,
            width: 10,
          }}
        />
      </View>
      <View
        style={{
          backgroundColor: status.color,
          borderRadius: 999,
          height: 40,
          marginRight: 9,
          width: 3,
        }}
      />
      <View style={{ flex: 1, gap: 3, paddingRight: 10 }}>
        <Text
          numberOfLines={1}
          style={{ color: palette.text, fontSize: 16, fontWeight: "700" }}
        >
          {lesson.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: palette.secondaryText, fontSize: 13 }}
        >
          {meta}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text
          style={{
            color: palette.text,
            fontSize: 15,
            fontVariant: ["tabular-nums"],
            fontWeight: "500",
          }}
        >
          {dayjs(lesson.startAt).format("HH:mm")}
        </Text>
        <Text
          style={{
            color: palette.secondaryText,
            fontSize: 13,
            fontVariant: ["tabular-nums"],
          }}
        >
          {dayjs(lesson.endAt).format("HH:mm")}
        </Text>
      </View>
    </View>
  );
}

export function MonthCalendarSnapshot({
  cellHeight,
  cellWidth,
  currentToday,
  lessonsByDate,
  month,
  palette,
  selectedDate,
}: {
  cellHeight: number;
  cellWidth: number;
  currentToday: string;
  lessonsByDate: LessonGroup;
  month: string;
  palette: CalendarPalette;
  selectedDate: string;
}) {
  const nextMonth = shiftMonth(month, 1);

  return (
    <View style={{ backgroundColor: palette.background }}>
      <WeekHeader cellWidth={cellWidth} palette={palette} />
      <MonthSnapshotSection
        cellHeight={cellHeight}
        cellWidth={cellWidth}
        currentToday={currentToday}
        lessonsByDate={lessonsByDate}
        month={month}
        palette={palette}
        selectedDate={selectedDate}
      />
      <MonthSnapshotSection
        cellHeight={cellHeight}
        cellWidth={cellWidth}
        currentToday={currentToday}
        lessonsByDate={lessonsByDate}
        month={nextMonth}
        palette={palette}
        selectedDate={selectedDate}
      />
    </View>
  );
}

function MonthSnapshotSection({
  cellHeight,
  cellWidth,
  currentToday,
  lessonsByDate,
  month,
  palette,
  selectedDate,
}: {
  cellHeight: number;
  cellWidth: number;
  currentToday: string;
  lessonsByDate: LessonGroup;
  month: string;
  palette: CalendarPalette;
  selectedDate: string;
}) {
  const cells = buildMonthCells(
    month,
    selectedDate,
    currentToday,
    lessonsByDate,
  );
  const rows = chunk(cells, 7);
  const monthDate = dayjs(`${month}-01`);
  const title =
    monthDate.month() === 0
      ? monthDate.format("YYYY年M月")
      : monthDate.format("M月");

  return (
    <View
      style={{
        backgroundColor: palette.background,
        height: getMonthSectionHeight(month, cellHeight),
      }}
    >
      <Text
        style={{
          color: palette.text,
          fontSize: 32,
          fontWeight: "700",
          lineHeight: 40,
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
      >
        {title}
      </Text>
      {rows.map((row) => (
        <View
          key={row.map((cell) => cell.dateText).join("-")}
          style={{ flexDirection: "row" }}
        >
          {row.map((cell) => (
            <MonthSnapshotCell
              key={cell.dateText}
              cell={cell}
              cellHeight={cellHeight}
              cellWidth={cellWidth}
              palette={palette}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function MonthSnapshotCell({
  cell,
  cellHeight,
  cellWidth,
  palette,
}: {
  cell: MonthCell;
  cellHeight: number;
  cellWidth: number;
  palette: CalendarPalette;
}) {
  if (cell.isPlaceholder) {
    return (
      <View
        style={{
          borderBottomColor: palette.separator,
          borderBottomWidth: 0.5,
          height: cellHeight,
          width: cellWidth,
        }}
      />
    );
  }

  const dayNumber = Number(cell.dateText.slice(8, 10));
  const displayColor = cell.inCurrentMonth
    ? palette.text
    : palette.tertiaryText;
  const lunarText = formatChineseCalendarDay(cell.dateText);

  return (
    <View
      style={{
        borderBottomColor: palette.separator,
        borderBottomWidth: 0.5,
        height: cellHeight,
        paddingHorizontal: 2,
        paddingTop: 6,
        width: cellWidth,
      }}
    >
      <View style={{ alignItems: "center", gap: 1, minHeight: 40 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: cell.isSelected ? palette.red : "transparent",
            borderRadius: 999,
            height: 30,
            justifyContent: "center",
            width: 30,
          }}
        >
          <Text
            style={{
              color: cell.isSelected
                ? "#FFFFFF"
                : cell.isToday
                  ? palette.red
                  : displayColor,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {dayNumber}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            color: cell.isSelected
              ? palette.red
              : cell.inCurrentMonth
                ? palette.secondaryText
                : palette.tertiaryText,
            fontSize: 11,
            lineHeight: 13,
          }}
        >
          {lunarText}
        </Text>
      </View>

      <View style={{ gap: 2, paddingTop: 4 }}>
        {cell.lessons.slice(0, 2).map((lesson) => (
          <MonthSnapshotEventStrip
            key={lesson.id}
            lesson={lesson}
            palette={palette}
          />
        ))}
        {cell.lessons.length > 2 ? (
          <Text
            style={{
              color: palette.red,
              fontSize: 12,
              fontWeight: "600",
              lineHeight: 15,
              paddingLeft: 4,
            }}
          >
            +{cell.lessons.length - 2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function MonthSnapshotEventStrip({
  lesson,
  palette,
}: {
  lesson: Lesson;
  palette: CalendarPalette;
}) {
  const status = getLessonStatusMeta(lesson.status, palette);

  return (
    <View
      style={{
        backgroundColor: status.background,
        borderRadius: 4,
        justifyContent: "center",
        minHeight: 16,
        paddingHorizontal: 4,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: status.color,
          fontSize: 10,
          fontWeight: "600",
          lineHeight: 13,
        }}
      >
        {lesson.title}
      </Text>
    </View>
  );
}
