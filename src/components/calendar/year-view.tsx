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

import {
  buildYearMonths,
  listViewabilityConfig,
  type CalendarPalette,
  type LessonGroup,
  type YearMonth,
} from "@/components/calendar/calendar-utils";

export function YearView({
  bottomInset,
  contentWidth,
  currentToday,
  lessonsByDate,
  listRef,
  onEndReached,
  onScroll,
  onSelectMonth,
  onViewableItemsChanged,
  palette,
  selectedDate,
  visibleYear,
  years,
}: {
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  lessonsByDate: LessonGroup;
  listRef: RefObject<FlatList<number> | null>;
  onEndReached: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onSelectMonth: (month: string) => void;
  onViewableItemsChanged: (info: {
    viewableItems: ViewToken<number>[];
  }) => void;
  palette: CalendarPalette;
  selectedDate: string;
  visibleYear: number;
  years: number[];
}) {
  const horizontalPadding = 14;
  const columnGap = 12;
  const monthWidth = (contentWidth - horizontalPadding * 2 - columnGap * 2) / 3;
  const miniMonthHeight = Math.max(126, Math.min(146, contentWidth * 0.36));
  const sectionTitleHeight = 54;
  const sectionRowGap = 24;
  const sectionHeight =
    sectionTitleHeight + miniMonthHeight * 4 + sectionRowGap * 3 + 18;
  const initialScrollIndex = Math.max(0, years.indexOf(visibleYear));
  const listExtraData = useMemo(
    () => ({ lessonsByDate, selectedDate }),
    [lessonsByDate, selectedDate],
  );

  return (
    <FlatList
      ref={listRef}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        backgroundColor: palette.background,
        paddingBottom: bottomInset + 18,
      }}
      data={years}
      extraData={listExtraData}
      getItemLayout={(_, index) => ({
        index,
        length: sectionHeight,
        offset: sectionHeight * index,
      })}
      initialNumToRender={3}
      initialScrollIndex={initialScrollIndex}
      keyExtractor={(item) => String(item)}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.2}
      onScroll={onScroll}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={({ item }) => (
        <YearSection
          columnGap={columnGap}
          currentToday={currentToday}
          horizontalPadding={horizontalPadding}
          lessonsByDate={lessonsByDate}
          miniMonthHeight={miniMonthHeight}
          monthWidth={monthWidth}
          onSelectMonth={onSelectMonth}
          palette={palette}
          selectedDate={selectedDate}
          sectionHeight={sectionHeight}
          year={item}
        />
      )}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: palette.background }}
      viewabilityConfig={listViewabilityConfig}
      windowSize={5}
    />
  );
}

function YearSection({
  columnGap,
  currentToday,
  horizontalPadding,
  lessonsByDate,
  miniMonthHeight,
  monthWidth,
  onSelectMonth,
  palette,
  selectedDate,
  sectionHeight,
  year,
}: {
  columnGap: number;
  currentToday: string;
  horizontalPadding: number;
  lessonsByDate: LessonGroup;
  miniMonthHeight: number;
  monthWidth: number;
  onSelectMonth: (month: string) => void;
  palette: CalendarPalette;
  selectedDate: string;
  sectionHeight: number;
  year: number;
}) {
  const months = useMemo(
    () => buildYearMonths(year, selectedDate, currentToday, lessonsByDate),
    [currentToday, lessonsByDate, selectedDate, year],
  );

  return (
    <View style={{ backgroundColor: palette.background, height: sectionHeight }}>
      <Text
        selectable
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
          <MiniMonth
            key={month.month}
            height={miniMonthHeight}
            month={month}
            onPress={() => onSelectMonth(month.month)}
            palette={palette}
            width={monthWidth}
          />
        ))}
      </View>
    </View>
  );
}

function MiniMonth({
  height,
  month,
  onPress,
  palette,
  width,
}: {
  height: number;
  month: YearMonth;
  onPress: () => void;
  palette: CalendarPalette;
  width: number;
}) {
  const cellWidth = width / 7;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        gap: 6,
        height,
        opacity: pressed ? 0.55 : 1,
        width,
      })}
    >
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
                    color: cell.isToday
                      ? "#FFFFFF"
                      : cell.hasLessons
                        ? palette.text
                        : palette.miniText,
                    fontSize: 9,
                    fontVariant: ["tabular-nums"],
                    fontWeight: cell.hasLessons ? "700" : "500",
                    lineHeight: 12,
                  }}
                >
                  {dayjs(cell.dateText).date()}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Pressable>
  );
}
