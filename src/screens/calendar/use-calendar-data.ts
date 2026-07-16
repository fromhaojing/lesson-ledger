import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  buildAgendaSections,
  buildDateRange,
  getLessonQueryRange,
  groupLessonsByDate,
  mergeLessonsForRange,
  type CalendarMode,
  type DateRange,
} from "@/components/calendar/calendar-utils";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";

export function useCalendarData({
  agendaRange,
  currentToday,
  mode,
  visibleMonth,
  visibleYear,
}: {
  agendaRange: DateRange;
  currentToday: string;
  mode: CalendarMode;
  visibleMonth: string;
  visibleYear: number;
}) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const lessonLoadRequestId = useRef(0);
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

  return {
    agendaDates,
    agendaSections,
    lessons,
    lessonsByDate,
    setLessons,
  };
}
