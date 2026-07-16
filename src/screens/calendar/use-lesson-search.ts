import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildAgendaSections,
  groupLessonsByDate,
} from "@/components/calendar/calendar-utils";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";

const LESSON_SEARCH_DEBOUNCE_MS = 250;
const LESSON_SEARCH_MIN_LENGTH = 2;

export function useLessonSearch({
  isVisible,
  searchText,
  selectedDate,
}: {
  isVisible: boolean;
  searchText: string;
  selectedDate: string;
}) {
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [searchResult, setSearchResult] = useState<{
    lessons: Lesson[];
    query: string;
  } | null>(null);
  const searchLoadRequestId = useRef(0);

  const normalizedSearchText = useMemo(
    () => normalizeLessonSearchText(searchText),
    [searchText],
  );
  const isReady =
    isVisible && normalizedSearchText.length >= LESSON_SEARCH_MIN_LENGTH;
  const isDebouncing = isReady && debouncedSearchText !== normalizedSearchText;
  const isActive =
    isReady && debouncedSearchText.length >= LESSON_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!isReady) return;

    const timer = setTimeout(() => {
      setDebouncedSearchText(normalizedSearchText);
    }, LESSON_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [isReady, normalizedSearchText]);

  useEffect(() => {
    const requestId = ++searchLoadRequestId.current;

    if (!isActive) return;

    lessonRepository
      .findBySearchPrefix(debouncedSearchText)
      .then((items) => {
        if (requestId === searchLoadRequestId.current) {
          setSearchResult({
            lessons: items,
            query: debouncedSearchText,
          });
        }
      })
      .catch((error) => {
        console.warn("Failed to search calendar lessons", error);
      });
  }, [debouncedSearchText, isActive]);

  const lessons = useMemo(
    () =>
      isActive && !isDebouncing && searchResult?.query === debouncedSearchText
        ? searchResult.lessons
        : [],
    [debouncedSearchText, isActive, isDebouncing, searchResult],
  );
  const lessonsByDate = useMemo(() => groupLessonsByDate(lessons), [lessons]);
  const agendaDates = useMemo(() => getLessonDateTexts(lessons), [lessons]);
  const agendaSections = useMemo(
    () => buildAgendaSections(agendaDates, lessonsByDate),
    [agendaDates, lessonsByDate],
  );
  const agendaSelectedDate = agendaSections[0]?.dateText ?? selectedDate;
  const emptyDescription = !isReady
    ? `至少输入 ${LESSON_SEARCH_MIN_LENGTH} 个字，按课程或学生开头搜索。`
    : isDebouncing
      ? "稍等一下，正在查找课程。"
      : "换个课程或学生开头试试。";
  const emptyTitle = !isReady
    ? "搜索课程"
    : isDebouncing
      ? "正在搜索"
      : "没有匹配课程";

  return {
    agendaSections,
    agendaSelectedDate,
    emptyDescription,
    emptyTitle,
  };
}

function normalizeLessonSearchText(text: string) {
  return text.trim().toLocaleLowerCase();
}

function getLessonDateTexts(lessons: Lesson[]) {
  return Array.from(new Set(lessons.map((lesson) => lesson.dateText))).sort();
}
