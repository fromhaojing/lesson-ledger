import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { Ionicons } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Keyboard,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
  type FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AgendaView } from "@/components/calendar/agenda-view";
import { CalendarChrome } from "@/components/calendar/calendar-chrome";
import {
  CalendarModeTransitionOverlay,
  type CalendarModeTransitionDirection,
} from "@/components/calendar/calendar-mode-transition";
import { MonthAgendaTransitionOverlay } from "@/components/calendar/month-agenda-transition";
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
  getLessonQueryRange,
  groupLessonsByDate,
  monthKeyFromDateText,
  monthRangeStep,
  shiftMonth,
  yearRangeStep,
  type AgendaReturnTarget,
  type AgendaSection,
  type CalendarMode,
  type CalendarPalette,
  type DateRange,
  type LessonGroup,
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

const SEARCH_SHEET_CONTENT_HEIGHT = 74;

type MonthAgendaTransition = {
  agendaSelectedDate: string;
  direction: "agendaToMonth" | "monthToAgenda";
  id: number;
  lessonsByDate: LessonGroup;
  month: string;
  sections?: AgendaSection[];
  selectedDate: string;
};

type MonthAgendaTransitionCompletion = {
  id: number;
  run: () => void;
};

type CalendarModeTransition = {
  direction: CalendarModeTransitionDirection;
  id: number;
  month: string;
  selectedDate: string;
  year: number;
};

function getAgendaRangeIncludingDate(
  range: DateRange,
  dateText: string,
): DateRange {
  const nextRange = {
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
  };

  return nextRange.start === range.start && nextRange.end === range.end
    ? range
    : nextRange;
}

function mergeLessonsForRange(
  currentLessons: Lesson[],
  rangeLessons: Lesson[],
  range: DateRange,
) {
  const merged = new Map<string, Lesson>();

  for (const lesson of currentLessons) {
    if (lesson.dateText < range.start || lesson.dateText > range.end) {
      merged.set(lesson.id, lesson);
    }
  }

  for (const lesson of rangeLessons) {
    merged.set(lesson.id, lesson);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const dateOrder = a.dateText.localeCompare(b.dateText);
    return dateOrder === 0 ? a.startAt.localeCompare(b.startAt) : dateOrder;
  });
}

function normalizeLessonSearchText(text: string) {
  return text.trim().toLocaleLowerCase();
}

function getLessonDateTexts(lessons: Lesson[]) {
  return Array.from(new Set(lessons.map((lesson) => lesson.dateText))).sort();
}

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
  const [isLessonSearchVisible, setIsLessonSearchVisible] = useState(false);
  const [lessonSearchText, setLessonSearchText] = useState("");
  const [searchLessonResult, setSearchLessonResult] = useState<{
    lessons: Lesson[];
    query: string;
  } | null>(null);
  const [monthAgendaTransition, setMonthAgendaTransition] =
    useState<MonthAgendaTransition | null>(null);
  const [calendarModeTransition, setCalendarModeTransition] =
    useState<CalendarModeTransition | null>(null);
  const [contentFrameHeight, setContentFrameHeight] = useState(0);
  const transitionIdRef = useRef(0);
  const transitionCompletionRef =
    useRef<MonthAgendaTransitionCompletion | null>(null);
  const calendarModeTransitionFallbackRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const lessonLoadRequestId = useRef(0);
  const searchLessonLoadRequestId = useRef(0);
  const lessonSearchInputRef = useRef<TextInput>(null);
  const monthListRef = useRef<FlatList<string>>(null);
  const yearListRef = useRef<FlatList<number>>(null);
  const agendaListRef = useRef<FlatList<AgendaSection>>(null);
  const searchAgendaListRef = useRef<FlatList<AgendaSection>>(null);
  const monthStartExtendLock = useRef(false);
  const yearStartExtendLock = useRef(false);
  const agendaStartExtendLock = useRef(false);

  const palette = useMemo(() => createCalendarPalette(theme), [theme]);
  const monthViewAvailableHeight = Math.max(
    0,
    contentFrameHeight || contentHeight - 88,
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
  const lessonQueryEnd = lessonQueryRange.end;
  const lessonQueryStart = lessonQueryRange.start;

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const requestId = ++lessonLoadRequestId.current;
      const queryRange = { end: lessonQueryEnd, start: lessonQueryStart };

      lessonRepository
        .findBetween(queryRange.start, queryRange.end)
        .then((items) => {
          if (mounted && requestId === lessonLoadRequestId.current) {
            setLessons((currentLessons) =>
              mergeLessonsForRange(currentLessons, items, queryRange),
            );
          }
        })
        .catch((error) => {
          console.warn("Failed to load calendar lessons", error);
        });

      return () => {
        mounted = false;
      };
    }, [lessonQueryEnd, lessonQueryStart]),
  );

  const normalizedLessonSearchText = useMemo(
    () => normalizeLessonSearchText(lessonSearchText),
    [lessonSearchText],
  );
  const isLessonSearchMode = isLessonSearchVisible;
  const isLessonSearchActive =
    isLessonSearchMode && normalizedLessonSearchText.length > 0;
  useEffect(() => {
    const requestId = ++searchLessonLoadRequestId.current;

    if (!isLessonSearchActive) return;

    lessonRepository
      .findByTitlePrefix(normalizedLessonSearchText)
      .then((items) => {
        if (requestId === searchLessonLoadRequestId.current) {
          setSearchLessonResult({
            lessons: items,
            query: normalizedLessonSearchText,
          });
        }
      })
      .catch((error) => {
        console.warn("Failed to search calendar lessons", error);
      });
  }, [isLessonSearchActive, normalizedLessonSearchText]);

  const lessonsByDate = useMemo(() => groupLessonsByDate(lessons), [lessons]);
  const agendaSections = useMemo(
    () =>
      buildAgendaSections(
        agendaDates,
        lessonsByDate,
        mode === "agenda" ? currentToday : undefined,
    ),
    [agendaDates, currentToday, lessonsByDate, mode],
  );
  const searchLessons = useMemo(
    () =>
      isLessonSearchActive &&
      searchLessonResult?.query === normalizedLessonSearchText
        ? searchLessonResult.lessons
        : [],
    [isLessonSearchActive, normalizedLessonSearchText, searchLessonResult],
  );
  const searchLessonsByDate = useMemo(
    () => groupLessonsByDate(searchLessons),
    [searchLessons],
  );
  const searchAgendaDates = useMemo(
    () => getLessonDateTexts(searchLessons),
    [searchLessons],
  );
  const searchAgendaSections = useMemo(
    () => buildAgendaSections(searchAgendaDates, searchLessonsByDate),
    [searchAgendaDates, searchLessonsByDate],
  );
  const searchAgendaSelectedDate =
    searchAgendaSections[0]?.dateText ?? selectedDate;
  const searchEmptyDescription = isLessonSearchActive
    ? "换个课程开头试试。"
    : "输入课程开头查看结果。";
  const searchEmptyTitle = isLessonSearchActive ? "没有匹配课程" : "搜索课程";

  useEffect(() => {
    return () => {
      if (calendarModeTransitionFallbackRef.current) {
        clearTimeout(calendarModeTransitionFallbackRef.current);
        calendarModeTransitionFallbackRef.current = null;
      }
    };
  }, []);
  const handleContentFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setContentFrameHeight((height) =>
      Math.abs(height - nextHeight) < 1 ? height : nextHeight,
    );
  }, []);

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
    setAgendaRange((range) => getAgendaRangeIncludingDate(range, dateText));
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
  const handleSearchAgendaScroll = useCallback(
    (_event: NativeSyntheticEvent<NativeScrollEvent>) => {},
    [],
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
  const handleSearchAgendaViewableItemsChanged = useCallback(
    (_info: { viewableItems: ViewToken<AgendaSection>[] }) => {},
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
          agendaListRef.current?.scrollToIndex({
            animated: true,
            index,
            viewPosition: 0.45,
          });
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

  const finishCalendarModeTransition = useCallback((transitionId: number) => {
    if (calendarModeTransitionFallbackRef.current) {
      clearTimeout(calendarModeTransitionFallbackRef.current);
      calendarModeTransitionFallbackRef.current = null;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCalendarModeTransition((transition) =>
          transition?.id === transitionId ? null : transition,
        );
      });
    });
  }, []);

  const startCalendarModeTransition = useCallback(
    ({
      direction,
      month,
      run,
      selectedDate,
      year,
    }: {
      direction: CalendarModeTransitionDirection;
      month: string;
      run: () => void;
      selectedDate: string;
      year: number;
    }) => {
      const transitionId = ++transitionIdRef.current;

      if (calendarModeTransitionFallbackRef.current) {
        clearTimeout(calendarModeTransitionFallbackRef.current);
        calendarModeTransitionFallbackRef.current = null;
      }

      if (contentFrameHeight <= 0) {
        run();
        return;
      }

      setCalendarModeTransition({
        direction,
        id: transitionId,
        month,
        selectedDate,
        year,
      });
      run();
      calendarModeTransitionFallbackRef.current = setTimeout(() => {
        finishCalendarModeTransition(transitionId);
      }, 380);
    },
    [contentFrameHeight, finishCalendarModeTransition],
  );

  const toggleYearMonth = useCallback(() => {
    setAgendaReturnTarget(null);

    if (mode === "year") {
      const nextMonth = monthKeyFromDateText(selectedDate);
      const nextYear = dayjs(selectedDate).year();
      includeMonthInRange(nextMonth);
      startCalendarModeTransition({
        direction: "yearToMonth",
        month: nextMonth,
        selectedDate,
        year: visibleYear,
        run: () => {
          setVisibleMonth(nextMonth);
          setVisibleYear(nextYear);
          navigateCalendarMode("month");
        },
      });
      return;
    }

    const nextYear = dayjs(`${visibleMonth}-01`).year();
    includeYearInRange(nextYear);
    startCalendarModeTransition({
      direction: "monthToYear",
      month: visibleMonth,
      selectedDate,
      year: nextYear,
      run: () => {
        setVisibleYear(nextYear);
        navigateCalendarMode("year");
      },
    });
  }, [
    includeMonthInRange,
    includeYearInRange,
    mode,
    navigateCalendarMode,
    selectedDate,
    startCalendarModeTransition,
    visibleYear,
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

    if (mode === "year") {
      startCalendarModeTransition({
        direction: "yearToMonth",
        month: nextMonth,
        selectedDate: nextToday,
        year: visibleYear,
        run: () => {
          setVisibleMonth(nextMonth);
          setVisibleYear(nextYear);
          navigateCalendarMode("month");
          setScrollTarget({ mode: "month", value: nextMonth });
        },
      });
      return;
    }

    setVisibleMonth(nextMonth);
    setVisibleYear(nextYear);
    navigateCalendarMode("month");
    setScrollTarget({ mode: "month", value: nextMonth });
  }, [
    includeDateInAgendaRange,
    includeMonthInRange,
    includeYearInRange,
    mode,
    navigateCalendarMode,
    startCalendarModeTransition,
    visibleYear,
  ]);

  const openAgendaAtDate = useCallback(
    (dateText: string, shouldScroll = true) => {
      includeDateInAgendaRange(dateText);
      setSelectedDate(dateText);
      setVisibleMonth(monthKeyFromDateText(dateText));
      setVisibleYear(dayjs(dateText).year());
      if (shouldScroll) {
        setScrollTarget({ mode: "agenda", value: dateText });
      }
      navigateCalendarMode("agenda");
    },
    [includeDateInAgendaRange, navigateCalendarMode],
  );
  const selectSearchAgendaDate = useCallback((dateText: string) => {
    setSelectedDate(dateText);
  }, []);

  const finishMonthAgendaTransition = useCallback((transitionId: number) => {
    const completion = transitionCompletionRef.current;
    if (completion?.id === transitionId) {
      transitionCompletionRef.current = null;
      completion.run();
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMonthAgendaTransition((transition) =>
          transition?.id === transitionId ? null : transition,
        );
      });
    });
  }, []);
  const ignoreTransitionPress = useCallback(() => {}, []);

  const openMonthDateAgenda = useCallback(
    async (dateText: string) => {
      const nextMonth = monthKeyFromDateText(dateText);
      const transitionId = ++transitionIdRef.current;
      const nextAgendaRange = buildInitialAgendaRange(dateText);
      const nextAgendaDates = buildDateRange(
        nextAgendaRange.start,
        nextAgendaRange.end,
      );
      let transitionLessons = lessons;

      try {
        const [rangeLessons, todayLessons] = await Promise.all([
          lessonRepository.findBetween(
            nextAgendaRange.start,
            nextAgendaRange.end,
          ),
          currentToday < nextAgendaRange.start || currentToday > nextAgendaRange.end
            ? lessonRepository.findByDate(currentToday)
            : Promise.resolve([]),
        ]);
        if (transitionId !== transitionIdRef.current) return;
        transitionLessons = mergeLessonsForRange(
          lessons,
          [...rangeLessons, ...todayLessons],
          nextAgendaRange,
        );
        setLessons(transitionLessons);
        setAgendaRange(nextAgendaRange);
      } catch (error) {
        console.warn("Failed to preload agenda lessons", error);
        if (transitionId !== transitionIdRef.current) return;
      }

      const transitionLessonsByDate = groupLessonsByDate(transitionLessons);
      transitionCompletionRef.current = {
        id: transitionId,
        run: () => openAgendaAtDate(dateText, false),
      };
      setMonthAgendaTransition({
        agendaSelectedDate: dateText,
        direction: "monthToAgenda",
        id: transitionId,
        lessonsByDate: transitionLessonsByDate,
        month: nextMonth,
        sections: buildAgendaSections(
          nextAgendaDates,
          transitionLessonsByDate,
          currentToday,
        ),
        selectedDate: dateText,
      });
      setAgendaReturnTarget({
        month: nextMonth,
        selectedDate: dateText,
      });
    },
    [currentToday, lessons, openAgendaAtDate],
  );

  const selectMonth = useCallback(
    (nextMonth: string) => {
      const todayMonth = monthKeyFromDateText(currentToday);
      const nextDate = selectedDate.startsWith(nextMonth)
        ? selectedDate
        : todayMonth === nextMonth
          ? currentToday
          : `${nextMonth}-01`;
      const nextYear = dayjs(`${nextMonth}-01`).year();
      includeMonthInRange(nextMonth);
      setAgendaReturnTarget(null);
      setSelectedDate(nextDate);

      if (mode === "year") {
        startCalendarModeTransition({
          direction: "yearToMonth",
          month: nextMonth,
          selectedDate: nextDate,
          year: visibleYear,
          run: () => {
            setVisibleMonth(nextMonth);
            setVisibleYear(nextYear);
            setScrollTarget({ mode: "month", value: nextMonth });
            navigateCalendarMode("month");
          },
        });
        return;
      }

      setVisibleMonth(nextMonth);
      setVisibleYear(nextYear);
      setScrollTarget({ mode: "month", value: nextMonth });
      navigateCalendarMode("month");
    },
    [
      currentToday,
      includeMonthInRange,
      mode,
      navigateCalendarMode,
      selectedDate,
      startCalendarModeTransition,
      visibleYear,
    ],
  );

  const openLesson = useCallback(
    (lesson: Lesson) => {
      router.push(`/lessons/${lesson.id}`);
    },
    [router],
  );

  const openLessonSearch = useCallback(() => {
    setIsLessonSearchVisible(true);
    requestAnimationFrame(() => {
      lessonSearchInputRef.current?.focus();
    });
  }, []);

  const cancelLessonSearch = useCallback(() => {
    setLessonSearchText("");
    setIsLessonSearchVisible(false);
    Keyboard.dismiss();
  }, []);

  const returnToMonthView = useCallback(() => {
    if (!agendaReturnTarget) return;

    const target = agendaReturnTarget;
    const transitionId = ++transitionIdRef.current;
    transitionCompletionRef.current = {
      id: transitionId,
      run: () => {
        includeMonthInRange(target.month);
        setSelectedDate(target.selectedDate);
        setVisibleMonth(target.month);
        setVisibleYear(dayjs(`${target.month}-01`).year());
        navigateCalendarMode("month");
        setAgendaReturnTarget(null);
      },
    };
    setMonthAgendaTransition({
      agendaSelectedDate: selectedDate,
      direction: "agendaToMonth",
      id: transitionId,
      lessonsByDate,
      month: target.month,
      sections: agendaSections,
      selectedDate: target.selectedDate,
    });
  }, [
    agendaReturnTarget,
    agendaSections,
    includeMonthInRange,
    lessonsByDate,
    navigateCalendarMode,
    selectedDate,
  ]);
  const todayMonth = monthKeyFromDateText(currentToday);
  const showTodayButton = mode !== "month" || visibleMonth !== todayMonth;
  const shouldReturnToMonth = mode === "agenda" && agendaReturnTarget !== null;
  const isCalendarTransitioning =
    calendarModeTransition !== null || monthAgendaTransition !== null;
  const isMonthLayerVisible = mode === "month";
  const isYearLayerVisible = mode === "year";
  const isAgendaLayerVisible = mode === "agenda";

  return (
    <View style={{ backgroundColor: palette.background, flex: 1 }}>
      <View style={{ backgroundColor: palette.background, paddingTop: insets.top }}>
        <CalendarChrome
          leadingLabel={shouldReturnToMonth ? "返回" : "首页"}
          onGoToCurrentMonth={
            isCalendarTransitioning ? ignoreTransitionPress : goToCurrentMonth
          }
          onLeadingPress={
            isCalendarTransitioning
              ? ignoreTransitionPress
              : shouldReturnToMonth
                ? returnToMonthView
                : returnHome
          }
          onOpenSearch={
            isCalendarTransitioning ? ignoreTransitionPress : openLessonSearch
          }
          onToggleYearMonth={
            isCalendarTransitioning ? ignoreTransitionPress : toggleYearMonth
          }
          palette={palette}
          showTodayButton={showTodayButton}
        />
      </View>

      <View
        onLayout={handleContentFrameLayout}
        style={{
          backgroundColor: palette.background,
          flex: 1,
          marginTop: isLessonSearchMode ? 22 : 12,
        }}
      >
        <View
          pointerEvents={isCalendarTransitioning ? "none" : "auto"}
          style={{ flex: 1 }}
        >
          <View
            accessibilityElementsHidden={!isMonthLayerVisible}
            importantForAccessibility={
              isMonthLayerVisible ? "auto" : "no-hide-descendants"
            }
            pointerEvents={isMonthLayerVisible ? "auto" : "none"}
            style={[
              calendarLayerStyle,
              {
                backgroundColor: palette.background,
                opacity: isMonthLayerVisible ? 1 : 0,
                zIndex: isMonthLayerVisible ? 3 : 1,
              },
            ]}
          >
            {contentFrameHeight > 0 ? (
              <MonthView
                availableHeight={monthViewAvailableHeight}
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
            ) : null}
          </View>

          <View
            accessibilityElementsHidden={!isYearLayerVisible}
            importantForAccessibility={
              isYearLayerVisible ? "auto" : "no-hide-descendants"
            }
            pointerEvents={isYearLayerVisible ? "auto" : "none"}
            style={[
              calendarLayerStyle,
              {
                backgroundColor: palette.background,
                opacity: isYearLayerVisible ? 1 : 0,
                zIndex: isYearLayerVisible ? 3 : 1,
              },
            ]}
          >
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
          </View>

          <View
            accessibilityElementsHidden={!isAgendaLayerVisible}
            importantForAccessibility={
              isAgendaLayerVisible ? "auto" : "no-hide-descendants"
            }
            pointerEvents={isAgendaLayerVisible ? "auto" : "none"}
            style={[
              calendarLayerStyle,
              {
                backgroundColor: palette.background,
                opacity: isAgendaLayerVisible ? 1 : 0,
                zIndex: isAgendaLayerVisible ? 4 : 1,
              },
            ]}
          >
            {isAgendaLayerVisible ? (
              <AgendaView
                availableHeight={contentFrameHeight}
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
            ) : null}
          </View>

          <View
            accessibilityElementsHidden={!isLessonSearchMode}
            importantForAccessibility={
              isLessonSearchMode ? "auto" : "no-hide-descendants"
            }
            pointerEvents={isLessonSearchMode ? "auto" : "none"}
            style={[
              calendarLayerStyle,
              {
                backgroundColor: palette.background,
                opacity: isLessonSearchMode ? 1 : 0,
                zIndex: isLessonSearchMode ? 6 : 1,
              },
            ]}
          >
            {isLessonSearchMode ? (
              <AgendaView
                availableHeight={contentFrameHeight}
                bottomInset={insets.bottom}
                contentWidth={contentWidth}
                currentToday={currentToday}
                emptyDescription={searchEmptyDescription}
                emptyTitle={searchEmptyTitle}
                listRef={searchAgendaListRef}
                onEndReached={ignoreTransitionPress}
                onOpenLesson={openLesson}
                onScroll={handleSearchAgendaScroll}
                onSelectDate={selectSearchAgendaDate}
                onViewableItemsChanged={handleSearchAgendaViewableItemsChanged}
                palette={palette}
                sections={searchAgendaSections}
                selectedDate={searchAgendaSelectedDate}
              />
            ) : null}
          </View>
        </View>

        {calendarModeTransition && contentFrameHeight > 0 ? (
          <CalendarModeTransitionOverlay
            key={calendarModeTransition.id}
            availableHeight={contentFrameHeight}
            bottomInset={insets.bottom}
            contentWidth={contentWidth}
            currentToday={currentToday}
            direction={calendarModeTransition.direction}
            lessonsByDate={lessonsByDate}
            month={calendarModeTransition.month}
            monthAvailableHeight={monthViewAvailableHeight}
            onRest={finishCalendarModeTransition}
            palette={palette}
            selectedDate={calendarModeTransition.selectedDate}
            transitionId={calendarModeTransition.id}
            year={calendarModeTransition.year}
          />
        ) : null}

        {monthAgendaTransition && contentFrameHeight > 0 ? (
          <MonthAgendaTransitionOverlay
            key={monthAgendaTransition.id}
            availableHeight={contentFrameHeight}
            agendaSelectedDate={monthAgendaTransition.agendaSelectedDate}
            bottomInset={insets.bottom}
            contentWidth={contentWidth}
            currentToday={currentToday}
            direction={monthAgendaTransition.direction}
            lessonsByDate={monthAgendaTransition.lessonsByDate}
            month={monthAgendaTransition.month}
            monthAvailableHeight={monthViewAvailableHeight}
            onRest={finishMonthAgendaTransition}
            palette={palette}
            sections={monthAgendaTransition.sections ?? agendaSections}
            selectedDate={monthAgendaTransition.selectedDate}
            transitionId={monthAgendaTransition.id}
          />
        ) : null}
      </View>

      <CalendarLessonSearchSheet
        inputRef={lessonSearchInputRef}
        isVisible={isLessonSearchVisible}
        onChangeText={setLessonSearchText}
        onClose={cancelLessonSearch}
        palette={palette}
        topInset={insets.top}
        value={lessonSearchText}
      />
    </View>
  );
}

function CalendarLessonSearchSheet({
  inputRef,
  isVisible,
  onChangeText,
  onClose,
  palette,
  topInset,
  value,
}: {
  inputRef: RefObject<TextInput | null>;
  isVisible: boolean;
  onChangeText: (value: string) => void;
  onClose: () => void;
  palette: CalendarPalette;
  topInset: number;
  value: string;
}) {
  const progress = useSharedValue(isVisible ? 1 : 0);
  const sheetHeight = topInset + SEARCH_SHEET_CONTENT_HEIGHT;

  useEffect(() => {
    progress.value = withTiming(isVisible ? 1 : 0, {
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });

    if (!isVisible) return;

    const focusTimeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 160);

    return () => {
      clearTimeout(focusTimeout);
    };
  }, [inputRef, isVisible, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -sheetHeight * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      pointerEvents={isVisible ? "box-none" : "none"}
      style={searchOverlayStyle}
    >
      <View
        style={{
          height: sheetHeight,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              alignItems: "center",
              backgroundColor: palette.background,
              borderBottomColor: palette.separator,
              borderBottomWidth: 0.5,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
              flexDirection: "row",
              gap: 10,
              height: sheetHeight,
              paddingBottom: 12,
              paddingHorizontal: 16,
              paddingTop: topInset + 12,
            },
            panelStyle,
          ]}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: palette.searchBackground,
              borderCurve: "continuous",
              borderRadius: 14,
              flex: 1,
              flexDirection: "row",
              height: 42,
              paddingLeft: 12,
              paddingRight: 10,
            }}
          >
            <Ionicons name="search" color={palette.searchIcon} size={19} />
            <TextInput
              ref={inputRef}
              accessibilityLabel="搜索课程"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={onChangeText}
              placeholder="搜索课程"
              placeholderTextColor={palette.searchIcon}
              returnKeyType="search"
              selectionColor={palette.red}
              style={{
                color: palette.text,
                flex: 1,
                fontSize: 17,
                height: 42,
                paddingHorizontal: 9,
                paddingVertical: 0,
              }}
              value={value}
            />
          </View>
          <Pressable
            accessibilityLabel="关闭搜索"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: palette.searchBackground,
              borderCurve: "continuous",
              borderRadius: 999,
              height: 36,
              justifyContent: "center",
              opacity: pressed ? 0.56 : 1,
              width: 36,
            })}
          >
            <Ionicons name="close" color={palette.searchIcon} size={22} />
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const searchOverlayStyle = {
  left: 0,
  position: "absolute" as const,
  right: 0,
  top: 0,
  zIndex: 30,
};

const calendarLayerStyle = {
  bottom: 0,
  left: 0,
  position: "absolute" as const,
  right: 0,
  top: 0,
};
