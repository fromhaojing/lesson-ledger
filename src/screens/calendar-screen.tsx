import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  useWindowDimensions,
  View,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AgendaView } from "@/components/calendar/agenda-view";
import { CalendarChrome } from "@/components/calendar/calendar-chrome";
import {
  agendaRangeStep,
  buildAgendaSections,
  buildDateRange,
  buildInitialAgendaRange,
  buildInitialMonthRange,
  buildInitialYearRange,
  buildMonthRange,
  buildYearRange,
  createCalendarPalette,
  getAgendaReturnSelectedDate,
  getLessonQueryRange,
  groupLessonsByDate,
  monthKeyFromDateText,
  monthRangeStep,
  shiftMonth,
  yearRangeStep,
  type AgendaReturnTarget,
  type AgendaSection,
  type CalendarMode,
  type DateRange,
  type MonthRange,
  type ScrollTarget,
  type YearRange,
} from "@/components/calendar/calendar-utils";
import { MonthView } from "@/components/calendar/month-view";
import { YearView } from "@/components/calendar/year-view";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { useTheme } from "@/theme";
import { todayText } from "@/utils/date";

dayjs.locale("zh-cn");

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
