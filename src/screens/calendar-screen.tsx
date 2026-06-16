import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { Button as NativeButton, Host as NativeHost } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson, LessonStatus } from "@/modules/lessons/lesson.types";
import { useTheme } from "@/theme";
import { monthKey, todayText } from "@/utils/date";

dayjs.locale("zh-cn");

type CalendarMode = "year" | "month" | "agenda";

type LessonGroup = Record<string, Lesson[]>;

type MonthCell = {
  dateText: string;
  inCurrentMonth: boolean;
  isPlaceholder?: boolean;
  isSelected: boolean;
  isToday: boolean;
  lessons: Lesson[];
};

type MonthRange = {
  end: string;
  start: string;
};

type YearRange = {
  end: number;
  start: number;
};

type DateRange = {
  end: string;
  start: string;
};

type ScrollTarget =
  | { mode: "agenda"; value: string }
  | { mode: "month"; value: string }
  | { mode: "year"; value: number };

type AgendaReturnTarget = {
  month: string;
  selectedDate: string;
};

type ListItemLayout = {
  index: number;
  length: number;
  offset: number;
};

const weekDayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const monthRangeStep = 12;
const yearRangeStep = 8;
const agendaRangeStep = 45;
const toolbarButtonGap = 8;
const listViewabilityConfig = { itemVisiblePercentThreshold: 35 };

export function CalendarScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = width;
  const contentHeight = Math.max(0, height - insets.top - insets.bottom);
  const currentToday = todayText();
  const initialMonth = monthKeyFromDateText(currentToday);
  const initialYear = dayjs(currentToday).year();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [selectedDate, setSelectedDate] = useState(currentToday);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [visibleYear, setVisibleYear] = useState(initialYear);
  const [agendaReturnTarget, setAgendaReturnTarget] =
    useState<AgendaReturnTarget | null>(null);
  const [monthRange, setMonthRange] = useState<MonthRange>(() =>
    buildInitialMonthRange(initialMonth),
  );
  const [yearRange, setYearRange] = useState<YearRange>(() =>
    buildInitialYearRange(initialYear),
  );
  const [agendaRange, setAgendaRange] = useState<DateRange>(() =>
    buildInitialAgendaRange(currentToday),
  );
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [contentAnimation] = useState(() => new Animated.Value(1));
  const lessonLoadRequestId = useRef(0);
  const monthListRef = useRef<FlatList<string>>(null);
  const yearListRef = useRef<FlatList<number>>(null);
  const agendaListRef = useRef<FlatList<AgendaSection>>(null);
  const monthStartExtendLock = useRef(false);
  const yearStartExtendLock = useRef(false);
  const agendaStartExtendLock = useRef(false);

  const palette = useMemo(() => createCalendarPalette(theme), [theme]);
  const transitionKey = mode;
  const animatedContentStyle = useMemo(
    () => ({
      flex: 1,
      opacity: contentAnimation,
      transform: [
        {
          translateY: contentAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
      ],
    }),
    [contentAnimation],
  );
  const monthItems = useMemo(
    () => buildMonthRange(monthRange.start, monthRange.end),
    [monthRange.end, monthRange.start],
  );
  const yearItems = useMemo(
    () => buildYearRange(yearRange.start, yearRange.end),
    [yearRange.end, yearRange.start],
  );
  const agendaDates = useMemo(
    () => buildDateRange(agendaRange.start, agendaRange.end),
    [agendaRange.end, agendaRange.start],
  );

  const lessonQueryRange = useMemo(
    () => getLessonQueryRange(mode, visibleMonth, visibleYear, agendaRange),
    [agendaRange, mode, visibleMonth, visibleYear],
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const requestId = ++lessonLoadRequestId.current;

      lessonRepository
        .findBetween(lessonQueryRange.start, lessonQueryRange.end)
        .then((items) => {
          if (mounted && requestId === lessonLoadRequestId.current) {
            setLessons(items);
          }
        })
        .catch((error) => {
          console.warn("Failed to load calendar lessons", error);
          if (mounted && requestId === lessonLoadRequestId.current) {
            setLessons([]);
          }
        });

      return () => {
        mounted = false;
      };
    }, [lessonQueryRange.end, lessonQueryRange.start]),
  );

  useEffect(() => {
    contentAnimation.setValue(0);
    Animated.timing(contentAnimation, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [contentAnimation, transitionKey]);

  const lessonsByDate = useMemo(() => groupLessonsByDate(lessons), [lessons]);
  const agendaSections = useMemo(
    () => buildAgendaSections(agendaDates, lessonsByDate),
    [agendaDates, lessonsByDate],
  );

  const includeMonthInRange = useCallback((month: string) => {
    setMonthRange((range) => ({
      end: month > range.end ? shiftMonth(month, monthRangeStep) : range.end,
      start:
        month < range.start ? shiftMonth(month, -monthRangeStep) : range.start,
    }));
  }, []);

  const includeYearInRange = useCallback((year: number) => {
    setYearRange((range) => ({
      end: year > range.end ? year + yearRangeStep : range.end,
      start: year < range.start ? year - yearRangeStep : range.start,
    }));
  }, []);

  const includeDateInAgendaRange = useCallback((dateText: string) => {
    setAgendaRange((range) => ({
      end:
        dateText > range.end
          ? dayjs(dateText).add(agendaRangeStep, "day").format("YYYY-MM-DD")
          : range.end,
      start:
        dateText < range.start
          ? dayjs(dateText)
              .subtract(agendaRangeStep, "day")
              .format("YYYY-MM-DD")
          : range.start,
    }));
  }, []);

  const extendMonthRangeStart = useCallback(() => {
    if (monthStartExtendLock.current) return;
    monthStartExtendLock.current = true;
    setMonthRange((range) => ({
      ...range,
      start: shiftMonth(range.start, -monthRangeStep),
    }));
    requestAnimationFrame(() => {
      monthStartExtendLock.current = false;
    });
  }, []);

  const extendYearRangeStart = useCallback(() => {
    if (yearStartExtendLock.current) return;
    yearStartExtendLock.current = true;
    setYearRange((range) => ({ ...range, start: range.start - yearRangeStep }));
    requestAnimationFrame(() => {
      yearStartExtendLock.current = false;
    });
  }, []);

  const extendAgendaRangeStart = useCallback(() => {
    if (agendaStartExtendLock.current) return;
    agendaStartExtendLock.current = true;
    setAgendaRange((range) => ({
      ...range,
      start: dayjs(range.start)
        .subtract(agendaRangeStep, "day")
        .format("YYYY-MM-DD"),
    }));
    requestAnimationFrame(() => {
      agendaStartExtendLock.current = false;
    });
  }, []);

  const extendMonthRangeEnd = useCallback(() => {
    setMonthRange((range) => ({
      ...range,
      end: shiftMonth(range.end, monthRangeStep),
    }));
  }, []);

  const extendYearRangeEnd = useCallback(() => {
    setYearRange((range) => ({ ...range, end: range.end + yearRangeStep }));
  }, []);

  const extendAgendaRangeEnd = useCallback(() => {
    setAgendaRange((range) => ({
      ...range,
      end: dayjs(range.end).add(agendaRangeStep, "day").format("YYYY-MM-DD"),
    }));
  }, []);

  const handleMonthScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (event.nativeEvent.contentOffset.y < 260) extendMonthRangeStart();
    },
    [extendMonthRangeStart],
  );

  const handleYearScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (event.nativeEvent.contentOffset.y < 260) extendYearRangeStart();
    },
    [extendYearRangeStart],
  );

  const handleAgendaScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (event.nativeEvent.contentOffset.y < 260) extendAgendaRangeStart();
    },
    [extendAgendaRangeStart],
  );

  const handleMonthViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
      const nextMonth = viewableItems.find((item) => item.isViewable)?.item;
      if (!nextMonth) return;
      setVisibleMonth(nextMonth);
      setVisibleYear(dayjs(`${nextMonth}-01`).year());
    },
    [],
  );

  const handleYearViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
      const nextYear = viewableItems.find((item) => item.isViewable)?.item;
      if (typeof nextYear !== "number") return;
      setVisibleYear(nextYear);
    },
    [],
  );

  const handleAgendaViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<AgendaSection>[] }) => {
      const nextSection = viewableItems.find((item) => item.isViewable)?.item;
      if (!nextSection) return;
      setVisibleMonth(monthKeyFromDateText(nextSection.dateText));
      setVisibleYear(dayjs(nextSection.dateText).year());
    },
    [],
  );

  useEffect(() => {
    if (!scrollTarget || scrollTarget.mode !== mode) return;

    requestAnimationFrame(() => {
      if (scrollTarget.mode === "month") {
        const index = monthItems.indexOf(scrollTarget.value);
        if (index >= 0) {
          monthListRef.current?.scrollToIndex({ animated: true, index });
        }
      } else if (scrollTarget.mode === "year") {
        const index = yearItems.indexOf(scrollTarget.value);
        if (index >= 0) {
          yearListRef.current?.scrollToIndex({ animated: true, index });
        }
      } else {
        const index = agendaSections.findIndex(
          (section) => section.dateText === scrollTarget.value,
        );
        if (index >= 0) {
          agendaListRef.current?.scrollToIndex({ animated: true, index });
        } else {
          return;
        }
      }

      setScrollTarget(null);
    });
  }, [agendaSections, mode, monthItems, scrollTarget, yearItems]);

  const returnHome = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/");
  }, [router]);

  const navigateCalendarMode = useCallback(
    (nextMode: CalendarMode) => {
      if (mode === nextMode) return;
      setMode(nextMode);
    },
    [mode],
  );

  const toggleYearMonth = useCallback(() => {
    setAgendaReturnTarget(null);

    if (mode === "year") {
      const nextMonth = monthKeyFromDateText(selectedDate);
      includeMonthInRange(nextMonth);
      setVisibleMonth(nextMonth);
      setVisibleYear(dayjs(selectedDate).year());
      setMode("month");
      setScrollTarget({ mode: "month", value: nextMonth });
      return;
    }

    const nextYear = dayjs(`${visibleMonth}-01`).year();
    includeYearInRange(nextYear);
    setVisibleYear(nextYear);
    setScrollTarget({ mode: "year", value: nextYear });
    navigateCalendarMode("year");
  }, [
    includeMonthInRange,
    includeYearInRange,
    mode,
    navigateCalendarMode,
    selectedDate,
    visibleMonth,
  ]);

  const goToCurrentMonth = useCallback(() => {
    const nextToday = todayText();
    const nextMonth = monthKeyFromDateText(nextToday);
    const nextYear = dayjs(nextToday).year();
    includeMonthInRange(nextMonth);
    includeYearInRange(nextYear);
    includeDateInAgendaRange(nextToday);
    setAgendaReturnTarget(null);
    setSelectedDate(nextToday);
    setVisibleMonth(nextMonth);
    setVisibleYear(nextYear);
    setMode("month");
    setScrollTarget({ mode: "month", value: nextMonth });
  }, [includeDateInAgendaRange, includeMonthInRange, includeYearInRange]);

  const openAgendaAtDate = useCallback(
    (dateText: string) => {
      includeDateInAgendaRange(dateText);
      setSelectedDate(dateText);
      setVisibleMonth(monthKeyFromDateText(dateText));
      setVisibleYear(dayjs(dateText).year());
      setScrollTarget({ mode: "agenda", value: dateText });
      navigateCalendarMode("agenda");
    },
    [includeDateInAgendaRange, navigateCalendarMode],
  );

  const openMonthDateAgenda = useCallback(
    (dateText: string) => {
      setAgendaReturnTarget({
        month: monthKeyFromDateText(dateText),
        selectedDate: getAgendaReturnSelectedDate(
          dateText,
          selectedDate,
          currentToday,
        ),
      });
      openAgendaAtDate(dateText);
    },
    [currentToday, openAgendaAtDate, selectedDate],
  );

  const selectMonth = useCallback(
    (nextMonth: string) => {
      const todayMonth = monthKeyFromDateText(currentToday);
      const nextDate = selectedDate.startsWith(nextMonth)
        ? selectedDate
        : todayMonth === nextMonth
          ? currentToday
          : `${nextMonth}-01`;
      includeMonthInRange(nextMonth);
      setAgendaReturnTarget(null);
      setSelectedDate(nextDate);
      setVisibleMonth(nextMonth);
      setVisibleYear(dayjs(`${nextMonth}-01`).year());
      setScrollTarget({ mode: "month", value: nextMonth });
      navigateCalendarMode("month");
    },
    [currentToday, includeMonthInRange, navigateCalendarMode, selectedDate],
  );

  const openLesson = useCallback(
    (lesson: Lesson) => {
      router.push(`/lessons/${lesson.id}`);
    },
    [router],
  );
  const returnToMonthView = useCallback(() => {
    if (!agendaReturnTarget) return;

    includeMonthInRange(agendaReturnTarget.month);
    setSelectedDate(agendaReturnTarget.selectedDate);
    setVisibleMonth(agendaReturnTarget.month);
    setVisibleYear(dayjs(`${agendaReturnTarget.month}-01`).year());
    setMode("month");
    setScrollTarget({ mode: "month", value: agendaReturnTarget.month });
    setAgendaReturnTarget(null);
  }, [agendaReturnTarget, includeMonthInRange]);
  const todayMonth = monthKeyFromDateText(currentToday);
  const showTodayButton = mode !== "month" || visibleMonth !== todayMonth;
  const shouldReturnToMonth = mode === "agenda" && agendaReturnTarget !== null;

  return (
    <View style={{ backgroundColor: palette.background, flex: 1 }}>
      <View style={{ paddingTop: insets.top }}>
        <CalendarChrome
          leadingLabel={shouldReturnToMonth ? "返回" : "首页"}
          mode={mode}
          onGoToCurrentMonth={goToCurrentMonth}
          onLeadingPress={shouldReturnToMonth ? returnToMonthView : returnHome}
          onToggleYearMonth={toggleYearMonth}
          palette={palette}
          showTodayButton={showTodayButton}
        />
      </View>

      <Animated.View style={animatedContentStyle}>
        {mode === "year" ? (
          <YearView
            bottomInset={insets.bottom}
            contentWidth={contentWidth}
            currentToday={currentToday}
            lessonsByDate={lessonsByDate}
            listRef={yearListRef}
            onEndReached={extendYearRangeEnd}
            onScroll={handleYearScroll}
            onSelectMonth={selectMonth}
            onViewableItemsChanged={handleYearViewableItemsChanged}
            palette={palette}
            selectedDate={selectedDate}
            visibleYear={visibleYear}
            years={yearItems}
          />
        ) : mode === "agenda" ? (
          <AgendaView
            bottomInset={insets.bottom}
            contentWidth={contentWidth}
            currentToday={currentToday}
            listRef={agendaListRef}
            onEndReached={extendAgendaRangeEnd}
            onOpenLesson={openLesson}
            onScroll={handleAgendaScroll}
            onSelectDate={openAgendaAtDate}
            onViewableItemsChanged={handleAgendaViewableItemsChanged}
            palette={palette}
            sections={agendaSections}
            selectedDate={selectedDate}
          />
        ) : (
          <MonthView
            availableHeight={Math.max(0, contentHeight - 88)}
            bottomInset={insets.bottom}
            contentWidth={contentWidth}
            currentToday={currentToday}
            listRef={monthListRef}
            lessonsByDate={lessonsByDate}
            months={monthItems}
            onEndReached={extendMonthRangeEnd}
            onOpenLesson={openLesson}
            onScroll={handleMonthScroll}
            onSelectDate={openMonthDateAgenda}
            onViewableItemsChanged={handleMonthViewableItemsChanged}
            palette={palette}
            selectedDate={selectedDate}
            visibleMonth={visibleMonth}
          />
        )}
      </Animated.View>
    </View>
  );
}

function CalendarChrome({
  leadingLabel,
  mode,
  onGoToCurrentMonth,
  onLeadingPress,
  onToggleYearMonth,
  palette,
  showTodayButton,
}: {
  leadingLabel: string;
  mode: CalendarMode;
  onGoToCurrentMonth: () => void;
  onLeadingPress: () => void;
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
      {isVisible ? (
        <NativeToolbarButton
          label="今天"
          onPress={onPress}
          palette={palette}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          {
            width: isVisible ? toolbarButtonGap : 0,
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
  systemImage?: "calendar" | "chevron.left";
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

function MonthView({
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

  return (
    <View style={{ flex: 1 }}>
      <WeekHeader cellWidth={cellWidth} palette={palette} />
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: bottomInset + 18 }}
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
        viewabilityConfig={listViewabilityConfig}
        windowSize={7}
      />
    </View>
  );
}

function MonthSection({
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
    <View style={{ height: getMonthSectionHeight(month, cellHeight) }}>
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

function WeekHeader({
  cellWidth,
  palette,
}: {
  cellWidth: number;
  palette: CalendarPalette;
}) {
  return (
    <View
      style={{
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

function YearView({
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
      contentContainerStyle={{ paddingBottom: bottomInset + 18 }}
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
  const months = buildYearMonths(
    year,
    selectedDate,
    currentToday,
    lessonsByDate,
  );

  return (
    <View style={{ height: sectionHeight }}>
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

function AgendaView({
  bottomInset,
  contentWidth,
  currentToday,
  listRef,
  onEndReached,
  onOpenLesson,
  onScroll,
  onSelectDate,
  onViewableItemsChanged,
  palette,
  sections,
  selectedDate,
}: {
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  listRef: RefObject<FlatList<AgendaSection> | null>;
  onEndReached: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onSelectDate: (dateText: string) => void;
  onViewableItemsChanged: (info: {
    viewableItems: ViewToken<AgendaSection>[];
  }) => void;
  palette: CalendarPalette;
  sections: AgendaSection[];
  selectedDate: string;
}) {
  const initialScrollIndex = Math.max(
    0,
    sections.findIndex((section) => section.dateText === selectedDate),
  );
  const itemLayouts = useMemo(
    () => buildAgendaItemLayouts(sections),
    [sections],
  );

  return (
    <FlatList
      ref={listRef}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        paddingBottom: bottomInset + 18,
        paddingTop: 8,
      }}
      data={sections}
      extraData={currentToday}
      getItemLayout={(_, index) => getListItemLayout(itemLayouts, index)}
      initialNumToRender={10}
      initialScrollIndex={sections.length > 0 ? initialScrollIndex : undefined}
      keyExtractor={(item) => item.dateText}
      ListEmptyComponent={<AgendaEmptyState palette={palette} />}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.2}
      onScroll={onScroll}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={({ item }) => (
        <AgendaDaySection
          contentWidth={contentWidth}
          currentToday={currentToday}
          onOpenLesson={onOpenLesson}
          onSelectDate={onSelectDate}
          palette={palette}
          section={item}
        />
      )}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      viewabilityConfig={listViewabilityConfig}
      windowSize={9}
    />
  );
}

function AgendaDaySection({
  contentWidth,
  currentToday,
  onOpenLesson,
  onSelectDate,
  palette,
  section,
}: {
  contentWidth: number;
  currentToday: string;
  onOpenLesson: (lesson: Lesson) => void;
  onSelectDate: (dateText: string) => void;
  palette: CalendarPalette;
  section: AgendaSection;
}) {
  return (
    <View
      style={{
        paddingLeft: 18,
        paddingRight: 18,
        paddingTop: 8,
        width: contentWidth,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelectDate(section.dateText)}
        style={({ pressed }) => ({
          alignItems: "center",
          borderBottomColor: palette.separator,
          borderBottomWidth: 0.5,
          flexDirection: "row",
          minHeight: 38,
          opacity: pressed ? 0.6 : 1,
        })}
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
      </Pressable>

      {section.lessons.map((lesson) => (
        <AgendaLessonRow
          key={lesson.id}
          lesson={lesson}
          onPress={() => onOpenLesson(lesson)}
          palette={palette}
        />
      ))}
    </View>
  );
}

function AgendaEmptyState({ palette }: { palette: CalendarPalette }) {
  return (
    <View
      style={{
        minHeight: 260,
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
      <Text
        style={{
          color: palette.secondaryText,
          fontSize: 14,
          lineHeight: 21,
          paddingTop: 8,
          textAlign: "center",
        }}
      >
        当前范围内没有课程安排。
      </Text>
    </View>
  );
}

function AgendaLessonRow({
  lesson,
  onPress,
  palette,
}: {
  lesson: Lesson;
  onPress: () => void;
  palette: CalendarPalette;
}) {
  const status = getLessonStatusMeta(lesson.status, palette);
  const meta =
    [lesson.grade, lesson.courseType].filter(Boolean).join(" · ") || "普通课程";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderBottomColor: palette.separator,
        borderBottomWidth: 0.5,
        flexDirection: "row",
        minHeight: 58,
        opacity: pressed ? 0.58 : 1,
        paddingVertical: 8,
      })}
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
    </Pressable>
  );
}

type CalendarPalette = ReturnType<typeof createCalendarPalette>;

function createCalendarPalette(theme: ReturnType<typeof useTheme>) {
  const isDark = theme.scheme === "dark";

  return {
    background: isDark ? "#000000" : "#FFFFFF",
    eventBackgrounds: {
      absent: isDark ? "rgba(191, 90, 242, 0.28)" : "#F1DDF9",
      cancelled: isDark ? "rgba(142, 142, 147, 0.25)" : "#EFEFF4",
      confirmed: isDark ? "rgba(48, 209, 88, 0.24)" : "#DDF8E5",
      pending: isDark ? "rgba(255, 159, 10, 0.25)" : "#FFE8C2",
      scheduled: isDark ? "rgba(10, 132, 255, 0.25)" : "#DCEEFF",
    },
    eventColors: {
      absent: isDark ? "#BF5AF2" : "#AF52DE",
      cancelled: isDark ? "#AEAEB2" : "#8E8E93",
      confirmed: isDark ? "#30D158" : "#34C759",
      pending: isDark ? "#FF9F0A" : "#FF9500",
      scheduled: isDark ? "#0A84FF" : "#007AFF",
    },
    icon: isDark ? "#FFFFFF" : "#111111",
    miniText: isDark ? "#D1D1D6" : "#111111",
    red: theme.colors.primary,
    secondaryText: isDark ? "#8E8E93" : "#8E8E93",
    separator: isDark ? "rgba(84, 84, 88, 0.65)" : "rgba(60, 60, 67, 0.18)",
    tertiaryText: isDark ? "#636366" : "#C7C7CC",
    text: isDark ? "#FFFFFF" : "#000000",
  };
}

function getLessonStatusMeta(status: LessonStatus, palette: CalendarPalette) {
  return {
    background: palette.eventBackgrounds[status],
    color: palette.eventColors[status],
  };
}

function groupLessonsByDate(lessons: Lesson[]) {
  const grouped: LessonGroup = {};

  for (const lesson of lessons) {
    (grouped[lesson.dateText] ??= []).push(lesson);
  }

  for (const dateLessons of Object.values(grouped)) {
    dateLessons.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  return grouped;
}

function buildMonthCells(
  month: string,
  selectedDate: string,
  today: string,
  lessonsByDate: LessonGroup,
): MonthCell[] {
  const firstDay = dayjs(`${month}-01`);
  const leadingCount = firstDay.day();
  const daysInMonth = firstDay.daysInMonth();
  const cellCount = getMonthRowCount(month) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const dayNumber = index - leadingCount + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return {
        dateText: `${month}-blank-${index}`,
        inCurrentMonth: false,
        isPlaceholder: true,
        isSelected: false,
        isToday: false,
        lessons: [],
      };
    }

    const date = firstDay.date(dayNumber);
    const dateText = date.format("YYYY-MM-DD");

    return {
      dateText,
      inCurrentMonth: true,
      isSelected: dateText === selectedDate,
      isToday: dateText === today,
      lessons: lessonsByDate[dateText] ?? [],
    };
  });
}

type YearMonth = {
  cells: MiniMonthCell[];
  isCurrentMonth: boolean;
  isSelectedMonth: boolean;
  month: string;
};

type MiniMonthCell = {
  dateText: string;
  hasLessons: boolean;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function buildYearMonths(
  year: number,
  selectedDate: string,
  today: string,
  lessonsByDate: LessonGroup,
): YearMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const cells = buildMiniMonthCells(month, today, lessonsByDate);

    return {
      cells,
      isCurrentMonth: monthKeyFromDateText(today) === month,
      isSelectedMonth: monthKeyFromDateText(selectedDate) === month,
      month,
    };
  });
}

function buildMiniMonthCells(
  month: string,
  today: string,
  lessonsByDate: LessonGroup,
): MiniMonthCell[] {
  const firstDay = dayjs(`${month}-01`);
  const gridStart = firstDay.subtract(firstDay.day(), "day");

  return Array.from({ length: 42 }, (_, index) => {
    const date = gridStart.add(index, "day");
    const dateText = date.format("YYYY-MM-DD");

    return {
      dateText,
      hasLessons: Boolean(lessonsByDate[dateText]?.length),
      inCurrentMonth: date.format("YYYY-MM") === month,
      isToday: dateText === today,
    };
  });
}

type AgendaSection = {
  dateText: string;
  lessons: Lesson[];
  subtitle: string;
  title: string;
};

function buildAgendaSections(
  dates: string[],
  lessonsByDate: LessonGroup,
): AgendaSection[] {
  return dates.reduce<AgendaSection[]>((sections, dateText) => {
    const lessons = lessonsByDate[dateText];
    if (!lessons?.length) return sections;

    sections.push({
      dateText,
      lessons,
      subtitle: formatChineseCalendarDate(dateText),
      title: dayjs(dateText).format("M月D日 - dddd"),
    });
    return sections;
  }, []);
}

function getLessonQueryRange(
  mode: CalendarMode,
  visibleMonth: string,
  visibleYear: number,
  agendaRange: DateRange,
) {
  if (mode === "year") {
    return { start: `${visibleYear}-01-01`, end: `${visibleYear}-12-31` };
  }

  if (mode === "agenda") {
    return agendaRange;
  }

  const startMonth = shiftMonth(visibleMonth, -2);
  const endMonth = shiftMonth(visibleMonth, 2);

  return {
    start: dayjs(`${startMonth}-01`).format("YYYY-MM-DD"),
    end: dayjs(`${endMonth}-01`).endOf("month").format("YYYY-MM-DD"),
  };
}

function buildMonthItemLayouts(
  months: string[],
  cellHeight: number,
): ListItemLayout[] {
  let offset = 0;

  return months.map((month, index) => {
    const length = getMonthSectionHeight(month, cellHeight);
    const layout = { index, length, offset };
    offset += length;
    return layout;
  });
}

function getMonthSectionHeight(month: string, cellHeight: number) {
  return 54 + getMonthRowCount(month) * cellHeight + 14;
}

function getMonthRowCount(month: string) {
  const firstDay = dayjs(`${month}-01`);
  return Math.ceil((firstDay.day() + firstDay.daysInMonth()) / 7);
}

function buildAgendaItemLayouts(sections: AgendaSection[]): ListItemLayout[] {
  let offset = 0;

  return sections.map((section, index) => {
    const length = getAgendaSectionHeight(section);
    const layout = { index, length, offset };
    offset += length;
    return layout;
  });
}

function getListItemLayout(layouts: ListItemLayout[], index: number) {
  return layouts[index] ?? { index, length: 0, offset: 0 };
}

function getAgendaSectionHeight(section?: AgendaSection) {
  return 8 + 38 + (section?.lessons.length ?? 1) * 58;
}

function buildInitialMonthRange(month: string): MonthRange {
  return {
    end: shiftMonth(month, monthRangeStep * 2),
    start: shiftMonth(month, -monthRangeStep * 2),
  };
}

function buildInitialYearRange(year: number): YearRange {
  return {
    end: year + yearRangeStep * 2,
    start: year - yearRangeStep * 2,
  };
}

function buildInitialAgendaRange(dateText: string): DateRange {
  return {
    end: dayjs(dateText)
      .add(agendaRangeStep * 3, "day")
      .format("YYYY-MM-DD"),
    start: dayjs(dateText)
      .subtract(agendaRangeStep * 2, "day")
      .format("YYYY-MM-DD"),
  };
}

function shiftMonth(month: string, amount: number) {
  return dayjs(`${month}-01`).add(amount, "month").format("YYYY-MM");
}

function buildMonthRange(startMonth: string, endMonth: string) {
  const months: string[] = [];
  let cursor = dayjs(`${startMonth}-01`);
  const end = dayjs(`${endMonth}-01`);

  while (cursor.isBefore(end) || cursor.isSame(end, "month")) {
    months.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return months;
}

function buildYearRange(startYear: number, endYear: number) {
  return Array.from(
    { length: endYear - startYear + 1 },
    (_, index) => startYear + index,
  );
}

function buildDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = dayjs(startDate);
  const end = dayjs(endDate);

  while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
    dates.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "day");
  }

  return dates;
}

function monthKeyFromDateText(dateText: string) {
  return monthKey(new Date(`${dateText}T00:00:00`));
}

function getAgendaReturnSelectedDate(
  openedDate: string,
  previousSelectedDate: string,
  today: string,
) {
  if (previousSelectedDate !== openedDate) return previousSelectedDate;
  if (today !== openedDate) return today;

  const date = dayjs(openedDate);
  return date.date() === 1
    ? date.add(1, "day").format("YYYY-MM-DD")
    : date.startOf("month").format("YYYY-MM-DD");
}

let chineseCalendarDayFormatter: Intl.DateTimeFormat | null | undefined;
let chineseCalendarDateFormatter: Intl.DateTimeFormat | null | undefined;
const chineseCalendarDayCache = new Map<string, string>();
const chineseCalendarDateCache = new Map<string, string>();

function formatChineseCalendarDay(dateText: string) {
  const cached = chineseCalendarDayCache.get(dateText);
  if (cached !== undefined) return cached;

  try {
    const formatter = getChineseCalendarDayFormatter();
    if (!formatter) return "";
    const date = new Date(`${dateText}T00:00:00`);
    const text = formatter.format(date).replace("日", "");
    chineseCalendarDayCache.set(dateText, text);
    return text;
  } catch {
    return "";
  }
}

function formatChineseCalendarDate(dateText: string) {
  const cached = chineseCalendarDateCache.get(dateText);
  if (cached !== undefined) return cached;

  try {
    const formatter = getChineseCalendarDateFormatter();
    if (!formatter) return "";
    const date = new Date(`${dateText}T00:00:00`);
    const text = formatter.format(date);
    chineseCalendarDateCache.set(dateText, text);
    return text;
  } catch {
    return "";
  }
}

function getChineseCalendarDayFormatter() {
  if (chineseCalendarDayFormatter !== undefined) {
    return chineseCalendarDayFormatter;
  }

  try {
    chineseCalendarDayFormatter = new Intl.DateTimeFormat(
      "zh-CN-u-ca-chinese",
      { day: "numeric" },
    );
  } catch {
    chineseCalendarDayFormatter = null;
  }

  return chineseCalendarDayFormatter;
}

function getChineseCalendarDateFormatter() {
  if (chineseCalendarDateFormatter !== undefined) {
    return chineseCalendarDateFormatter;
  }

  try {
    chineseCalendarDateFormatter = new Intl.DateTimeFormat(
      "zh-CN-u-ca-chinese",
      {
        day: "numeric",
        month: "long",
      },
    );
  } catch {
    chineseCalendarDateFormatter = null;
  }

  return chineseCalendarDateFormatter;
}

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
