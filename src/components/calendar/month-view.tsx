import dayjs from "dayjs";
import { useMemo, type RefObject } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";

import type { Lesson } from "@/modules/lessons/lesson.types";
import {
  buildMonthCells,
  buildMonthItemLayouts,
  chunk,
  formatChineseCalendarDay,
  getLessonStatusMeta,
  getListItemLayout,
  getMonthSectionHeight,
  listViewabilityConfig,
  weekDayLabels,
  type CalendarPalette,
  type LessonGroup,
  type MonthCell,
} from "@/components/calendar/calendar-utils";
import { useTheme } from "@/theme";

export function MonthView({
  availableHeight,
  bottomInset,
  contentWidth,
  currentToday,
  listRef,
  lessonsByDate,
  months,
  onEndReached,
  onOpenLesson,
  onScroll,
  onSelectDate,
  onViewableItemsChanged,
  palette,
  selectedDate,
  visibleMonth,
}: {
  availableHeight: number;
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  listRef: RefObject<FlatList<string> | null>;
  lessonsByDate: LessonGroup;
  months: string[];
  onEndReached: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onSelectDate: (dateText: string) => void;
  onViewableItemsChanged: (info: {
    viewableItems: ViewToken<string>[];
  }) => void;
  palette: CalendarPalette;
  selectedDate: string;
  visibleMonth: string;
}) {
  const cellWidth = contentWidth / 7;
  const cellHeight = Math.max(92, Math.min(112, availableHeight / 6.4));
  const initialScrollIndex = Math.max(0, months.indexOf(visibleMonth));
  const listExtraData = useMemo(
    () => ({ lessonsByDate, selectedDate }),
    [lessonsByDate, selectedDate],
  );
  const itemLayouts = useMemo(
    () => buildMonthItemLayouts(months, cellHeight),
    [cellHeight, months],
  );
  const theme = useTheme()

  return (
    <View style={{ backgroundColor: theme.colors.surface, flex: 1 }}>
      <WeekHeader cellWidth={cellWidth} palette={palette} />
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          backgroundColor: palette.background,
          paddingBottom: bottomInset + 18,
        }}
        data={months}
        extraData={listExtraData}
        getItemLayout={(_, index) => getListItemLayout(itemLayouts, index)}
        initialNumToRender={5}
        initialScrollIndex={initialScrollIndex}
        keyExtractor={(item) => item}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={1.2}
        onScroll={onScroll}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item }) => (
          <MonthSection
            cellHeight={cellHeight}
            cellWidth={cellWidth}
            currentToday={currentToday}
            lessonsByDate={lessonsByDate}
            month={item}
            onOpenLesson={onOpenLesson}
            onSelectDate={onSelectDate}
            palette={palette}
            selectedDate={selectedDate}
          />
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: palette.background }}
        viewabilityConfig={listViewabilityConfig}
        windowSize={7}
      />
    </View>
  );
}

export function MonthSection({
  cellHeight,
  cellWidth,
  currentToday,
  lessonsByDate,
  month,
  onOpenLesson,
  onSelectDate,
  palette,
  selectedDate,
}: {
  cellHeight: number;
  cellWidth: number;
  currentToday: string;
  lessonsByDate: LessonGroup;
  month: string;
  onOpenLesson: (lesson: Lesson) => void;
  onSelectDate: (dateText: string) => void;
  palette: CalendarPalette;
  selectedDate: string;
}) {
  const cells = useMemo(
    () => buildMonthCells(month, selectedDate, currentToday, lessonsByDate),
    [currentToday, lessonsByDate, month, selectedDate],
  );
  const rows = useMemo(() => chunk(cells, 7), [cells]);
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
        selectable
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
            <MonthDayCell
              key={cell.dateText}
              cell={cell}
              cellHeight={cellHeight}
              cellWidth={cellWidth}
              onOpenLesson={onOpenLesson}
              onPress={() => {
                if (!cell.isPlaceholder) onSelectDate(cell.dateText);
              }}
              palette={palette}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function WeekHeader({
  cellWidth,
  palette,
}: {
  cellWidth: number;
  palette: CalendarPalette;
}) {
  return (
    <View
      style={{
        backgroundColor: palette.background,
        borderBottomColor: palette.separator,
        borderBottomWidth: 0.5,
        flexDirection: "row",
        paddingBottom: 8,
        paddingTop: 4,
      }}
    >
      {weekDayLabels.map((label, index) => (
        <Text
          key={label}
          style={{
            color:
              index === 0 || index === 6 ? palette.secondaryText : palette.text,
            fontSize: 13,
            fontWeight: "500",
            textAlign: "center",
            width: cellWidth,
          }}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

function MonthDayCell({
  cell,
  cellHeight,
  cellWidth,
  onOpenLesson,
  onPress,
  palette,
}: {
  cell: MonthCell;
  cellHeight: number;
  cellWidth: number;
  onOpenLesson: (lesson: Lesson) => void;
  onPress: () => void;
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

  const date = dayjs(cell.dateText);
  const displayColor = cell.inCurrentMonth
    ? palette.text
    : palette.tertiaryText;
  const lunarText = formatChineseCalendarDay(cell.dateText);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        borderBottomColor: palette.separator,
        borderBottomWidth: 0.5,
        height: cellHeight,
        opacity: pressed ? 0.62 : 1,
        paddingHorizontal: 2,
        paddingTop: 6,
        width: cellWidth,
      })}
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
            {date.date()}
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
          <MonthEventStrip
            key={lesson.id}
            lesson={lesson}
            onPress={() => onOpenLesson(lesson)}
            palette={palette}
          />
        ))}
        {cell.lessons.length > 2 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => ({
              minHeight: 16,
              opacity: pressed ? 0.58 : 1,
              justifyContent: "center",
            })}
          >
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
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function MonthEventStrip({
  lesson,
  onPress,
  palette,
}: {
  lesson: Lesson;
  onPress: () => void;
  palette: CalendarPalette;
}) {
  const status = getLessonStatusMeta(lesson.status, palette);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: status.background,
        borderRadius: 4,
        minHeight: 16,
        justifyContent: "center",
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
    </Pressable>
  );
}
