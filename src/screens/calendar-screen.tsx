import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CalendarProvider,
  ExpandableCalendar,
  LocaleConfig,
  Timeline,
  type DateData,
  type TimelineEventProps,
  type TimelinePackedEventProps
} from "react-native-calendars";

import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { useTheme } from "@/theme";
import { monthKey, monthRange, todayText } from "@/utils/date";

dayjs.locale("zh-cn");

LocaleConfig.locales["zh-cn"] = {
  monthNames: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
  monthNamesShort: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  dayNames: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
  dayNamesShort: ["日", "一", "二", "三", "四", "五", "六"],
  today: "今天"
};
LocaleConfig.defaultLocale = "zh-cn";

export function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const calendarWidth = Math.max(280, width - 40);
  const [selectedDate, setSelectedDate] = useState(todayText());
  const [visibleMonth, setVisibleMonth] = useState(monthKey());
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const load = useCallback(async () => {
    const range = monthRange(visibleMonth);
    const weekStart = startOfDisplayWeek(selectedDate);
    const weekEnd = weekStart.add(6, "day");
    const [monthLessons, weekLessons] = await Promise.all([
      lessonRepository.findBetween(range.start, range.end),
      lessonRepository.findBetween(weekStart.format("YYYY-MM-DD"), weekEnd.format("YYYY-MM-DD"))
    ]);
    setLessons([...new Map([...monthLessons, ...weekLessons].map((lesson) => [lesson.id, lesson])).values()]);
  }, [selectedDate, visibleMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const lessonById = useMemo(() => Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);

  const calendarTheme = useMemo(
    () => ({
      arrowColor: theme.colors.primary,
      calendarBackground: theme.colors.surface,
      dayTextColor: theme.colors.text,
      monthTextColor: theme.colors.text,
      selectedDayBackgroundColor: theme.colors.primary,
      selectedDayTextColor: "#FFFFFF",
      dotColor: theme.colors.primary,
      textDayFontSize: 14,
      textDayHeaderFontSize: 12,
      textDisabledColor: theme.colors.muted,
      textInactiveColor: theme.colors.muted,
      textMonthFontSize: 17,
      textMonthFontWeight: "700" as const,
      textSectionTitleColor: theme.colors.muted,
      todayTextColor: theme.colors.primary,
      "stylesheet.calendar.header": {
        header: {
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 4,
          paddingTop: 2
        },
        monthText: {
          color: theme.colors.text,
          fontSize: 17,
          fontWeight: "700"
        },
        week: {
          borderBottomColor: theme.colors.line,
          borderBottomWidth: 1,
          flexDirection: "row",
          justifyContent: "space-around",
          marginTop: 8,
          paddingBottom: 8
        }
      },
      knob: {
        backgroundColor: theme.colors.line,
        height: 4,
        marginTop: 8,
        width: 42
      }
    }),
    [theme.colors.line, theme.colors.muted, theme.colors.primary, theme.colors.surface, theme.colors.text]
  );

  const timelineTheme = useMemo(
    () => ({
      calendarBackground: theme.colors.surface,
      event: {
        backgroundColor: theme.colors.primary,
        // borderColor: theme.colors.primary,
        borderRadius: 10,
        paddingLeft: 8,
        paddingTop: 7
      },
      eventSummary: {
        color: "rgba(255, 255, 255, 0.82)",
        fontSize: 11
      },
      eventTimes: {
        color: "rgba(255, 255, 255, 0.82)",
        fontSize: 10,
        fontWeight: "600"
      },
      eventTitle: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "700"
      },
      line: {
        backgroundColor: theme.colors.line
      },
      nowIndicatorKnob: {
        backgroundColor: theme.colors.danger
      },
      nowIndicatorLine: {
        backgroundColor: theme.colors.danger
      },
      timeLabel: {
        color: theme.colors.muted,
        fontSize: 11
      },
      verticalLine: {
        backgroundColor: theme.colors.line
      }
    }),
    [theme.colors.danger, theme.colors.line, theme.colors.muted, theme.colors.primary, theme.colors.surface]
  );

  const markedDates = useMemo(() => {
    type CalendarMarker = {
      dots: { color: string; key: string }[];
      selected?: boolean;
      selectedColor?: string;
    };

    const markers = lessons.reduce<Record<string, CalendarMarker>>((acc, lesson) => {
      const color = lessonStatusColor(lesson, theme);
      const existing = acc[lesson.dateText]?.dots ?? [];
      const nextDots = existing.some((dot) => dot.color === color) ? existing : [...existing, { color, key: `${lesson.status}-${color}` }];
      acc[lesson.dateText] = { dots: nextDots.slice(0, 3) };
      return acc;
    }, {});

    markers[selectedDate] = {
      ...(markers[selectedDate] ?? { dots: [] }),
      selected: true,
      selectedColor: theme.colors.primary
    };

    return markers;
  }, [lessons, selectedDate, theme]);

  const timelineEvents = useMemo(() => {
    return lessons.reduce<Record<string, TimelineEventProps[]>>((acc, lesson) => {
      const event: TimelineEventProps = {
        color: lessonStatusColor(lesson, theme),
        end: lesson.endAt,
        id: lesson.id,
        start: lesson.startAt,
        summary: [lesson.grade, lesson.courseType].filter(Boolean).join(" · ") || "普通课程",
        title: lesson.title
      };
      acc[lesson.dateText] = [...(acc[lesson.dateText] ?? []), event];
      return acc;
    }, {});
  }, [lessons, theme]);
  const selectDate = useCallback((dateText: string) => {
    setSelectedDate(dateText);
  }, []);

  const openLesson = useCallback(
    (lesson: Lesson) => {
      setSelectedDate(lesson.dateText);
      setVisibleMonth(monthKey(new Date(lesson.startAt)));
      router.push(`/lessons/${lesson.id}`);
    },
    [router]
  );

  const handleDayPress = useCallback(
    (date: DateData) => {
      const nextMonth = `${date.year}-${String(date.month).padStart(2, "0")}`;
      if (nextMonth !== visibleMonth) {
        setVisibleMonth(nextMonth);
      }
      selectDate(date.dateString);
    },
    [selectDate, visibleMonth]
  );

  const handleMonthChange = useCallback((date: DateData) => {
    setVisibleMonth(`${date.year}-${String(date.month).padStart(2, "0")}`);
  }, []);

  const handleTimelineEventPress = useCallback(
    (event: TimelineEventProps) => {
      const lessonId = event.id;
      if (!lessonId) return;
      const lesson = lessonById[lessonId];
      if (lesson) {
        openLesson(lesson);
      }
    },
    [lessonById, openLesson]
  );

  const renderTimelineEvent = useCallback(
    (event: TimelinePackedEventProps) => {
      return (
        <View style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
            {event.title}
          </Text>
          <Text numberOfLines={1} style={{ color: "rgba(255, 255, 255, 0.86)", fontSize: 11, fontVariant: ["tabular-nums"], fontWeight: "600" }}>
            {dayjs(event.start).format("HH:mm")} - {dayjs(event.end).format("HH:mm")}
          </Text>
          {event.summary ? (
            <Text numberOfLines={1} style={{ color: "rgba(255, 255, 255, 0.78)", fontSize: 11 }}>
              {event.summary}
            </Text>
          ) : null}
        </View>
      );
    },
    []
  );

  const renderCalendarArrow = useCallback(
    (direction: "left" | "right") => (
      <Ionicons name={direction === "left" ? "chevron-back" : "chevron-forward"} size={30} color={theme.colors.primary} />
    ),
    [theme.colors.primary]
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ gap: 12, paddingBottom: 120 }}>
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            borderCurve: "continuous",
            borderRadius: 18,
            borderWidth: 1,
            marginHorizontal: 20,
            overflow: "hidden"
          }}
        >
          <CalendarProvider
            date={selectedDate}
            disableAutoDaySelection={[
              ExpandableCalendar.navigationTypes.MONTH_SCROLL,
              ExpandableCalendar.navigationTypes.WEEK_SCROLL,
              ExpandableCalendar.navigationTypes.MONTH_ARROWS,
              ExpandableCalendar.navigationTypes.WEEK_ARROWS
            ]}
            numberOfDays={1}
            onMonthChange={handleMonthChange}
            timelineLeftInset={48}
          >
            <ExpandableCalendar
              allowShadow={false}
              animateScroll={false}
              calendarWidth={calendarWidth}
              closeOnDayPress
              current={selectedDate}
              disablePan={false}
              enableSwipeMonths
              firstDay={1}
              hideArrows={false}
              hideExtraDays={false}
              hideKnob={false}
              initialPosition={ExpandableCalendar.positions.CLOSED}
              markedDates={markedDates}
              markingType="multi-dot"
              onDayPress={handleDayPress}
              renderArrow={renderCalendarArrow}
              theme={calendarTheme}
            />
          </CalendarProvider>
        </View>
        <View
          style={{
            backgroundColor: theme.colors.surface,
            height: 620
          }}
        >
          <CalendarProvider
            date={selectedDate}
            numberOfDays={1}
            timelineLeftInset={48}
          >
            <Timeline
              date={selectedDate}
              end={24}
              events={timelineEvents[selectedDate] ?? []}
              format24h
              initialTime={{ hour: 6, minutes: 0 }}
              onEventPress={handleTimelineEventPress}
              overlapEventsSpacing={6}
              renderEvent={renderTimelineEvent}
              rightEdgeSpacing={10}
              scrollToFirst
              showNowIndicator
              start={6}
              theme={timelineTheme}
              timelineLeftInset={48}
            />
          </CalendarProvider>
        </View>
      </ScrollView>
    </View>
  );
}

function startOfDisplayWeek(dateText: string) {
  const day = dayjs(dateText);
  return day.subtract((day.day() + 6) % 7, "day");
}

function lessonStatusColor(lesson: Lesson, theme: ReturnType<typeof useTheme>) {
  if (lesson.status === "pending") return theme.colors.warning;
  if (lesson.status === "confirmed") return theme.colors.success;
  if (lesson.status === "cancelled") return theme.colors.danger;
  if (lesson.status === "absent") return theme.colors.purple;
  return theme.colors.primary;
}
