import dayjs from "dayjs";

import type { Lesson, LessonStatus } from "@/modules/lessons/lesson.types";
import { monthKey } from "@/utils/date";

export type CalendarMode = "year" | "month" | "agenda";

export type LessonGroup = Record<string, Lesson[]>;

export type MonthCell = {
  dateText: string;
  inCurrentMonth: boolean;
  isPlaceholder?: boolean;
  isSelected: boolean;
  isToday: boolean;
  lessons: Lesson[];
};

export type MonthRange = {
  end: string;
  start: string;
};

export type YearRange = {
  end: number;
  start: number;
};

export type DateRange = {
  end: string;
  start: string;
};

export type ScrollTarget =
  | { mode: "agenda"; value: string }
  | { mode: "month"; value: string }
  | { mode: "year"; value: number };

export type AgendaReturnTarget = {
  month: string;
  selectedDate: string;
};

type ListItemLayout = {
  index: number;
  length: number;
  offset: number;
};

type CalendarTheme = {
  colors: {
    primary: string;
  };
  scheme: "light" | "dark";
};

export type CalendarPalette = {
  background: string;
  eventBackgrounds: Record<LessonStatus, string>;
  eventColors: Record<LessonStatus, string>;
  icon: string;
  miniText: string;
  red: string;
  secondaryText: string;
  separator: string;
  tertiaryText: string;
  text: string;
};

export const weekDayLabels = ["日", "一", "二", "三", "四", "五", "六"];
export const monthRangeStep = 12;
export const yearRangeStep = 8;
export const agendaRangeStep = 45;
export const toolbarButtonGap = 8;
export const listViewabilityConfig = { itemVisiblePercentThreshold: 35 };

export function createCalendarPalette(theme: CalendarTheme) {
  const isDark = theme.scheme === "dark";

  return {
    background: isDark ? "#000000" : "#FFFFFF",
    eventBackgrounds: {
      cancelled: isDark ? "rgba(142, 142, 147, 0.25)" : "#EFEFF4",
      confirmed: isDark ? "rgba(48, 209, 88, 0.24)" : "#DDF8E5",
      pending: isDark ? "rgba(255, 159, 10, 0.25)" : "#FFE8C2",
      scheduled: isDark ? "rgba(10, 132, 255, 0.25)" : "#DCEEFF",
    },
    eventColors: {
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

export function getLessonStatusMeta(status: LessonStatus, palette: CalendarPalette) {
  return {
    background: palette.eventBackgrounds[status],
    color: palette.eventColors[status],
  };
}

export function groupLessonsByDate(lessons: Lesson[]) {
  const grouped: LessonGroup = {};

  for (const lesson of lessons) {
    (grouped[lesson.dateText] ??= []).push(lesson);
  }

  for (const dateLessons of Object.values(grouped)) {
    dateLessons.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  return grouped;
}

export function buildMonthCells(
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

export type YearMonth = {
  cells: MiniMonthCell[];
  isCurrentMonth: boolean;
  isSelectedMonth: boolean;
  month: string;
};

export type MiniMonthCell = {
  dateText: string;
  hasLessons: boolean;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export function buildYearMonths(
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

export function buildMiniMonthCells(
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

export type AgendaSection = {
  dateText: string;
  lessons: Lesson[];
  subtitle: string;
  title: string;
};

export function buildAgendaSections(
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

export function getLessonQueryRange(
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

export function buildMonthItemLayouts(
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

export function getMonthSectionHeight(month: string, cellHeight: number) {
  return 54 + getMonthRowCount(month) * cellHeight + 14;
}

export function getMonthRowCount(month: string) {
  const firstDay = dayjs(`${month}-01`);
  return Math.ceil((firstDay.day() + firstDay.daysInMonth()) / 7);
}

export function buildAgendaItemLayouts(sections: AgendaSection[]): ListItemLayout[] {
  let offset = 0;

  return sections.map((section, index) => {
    const length = getAgendaSectionHeight(section);
    const layout = { index, length, offset };
    offset += length;
    return layout;
  });
}

export function getListItemLayout(layouts: ListItemLayout[], index: number) {
  return layouts[index] ?? { index, length: 0, offset: 0 };
}

export function getAgendaSectionHeight(section?: AgendaSection) {
  return 8 + 38 + (section?.lessons.length ?? 1) * 58;
}

export function buildInitialMonthRange(month: string): MonthRange {
  return {
    end: shiftMonth(month, monthRangeStep * 2),
    start: shiftMonth(month, -monthRangeStep * 2),
  };
}

export function buildInitialYearRange(year: number): YearRange {
  return {
    end: year + yearRangeStep * 2,
    start: year - yearRangeStep * 2,
  };
}

export function buildInitialAgendaRange(dateText: string): DateRange {
  return {
    end: dayjs(dateText)
      .add(agendaRangeStep * 3, "day")
      .format("YYYY-MM-DD"),
    start: dayjs(dateText)
      .subtract(agendaRangeStep * 2, "day")
      .format("YYYY-MM-DD"),
  };
}

export function shiftMonth(month: string, amount: number) {
  return dayjs(`${month}-01`).add(amount, "month").format("YYYY-MM");
}

export function buildMonthRange(startMonth: string, endMonth: string) {
  const months: string[] = [];
  let cursor = dayjs(`${startMonth}-01`);
  const end = dayjs(`${endMonth}-01`);

  while (cursor.isBefore(end) || cursor.isSame(end, "month")) {
    months.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return months;
}

export function buildYearRange(startYear: number, endYear: number) {
  return Array.from(
    { length: endYear - startYear + 1 },
    (_, index) => startYear + index,
  );
}

export function buildDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = dayjs(startDate);
  const end = dayjs(endDate);

  while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
    dates.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "day");
  }

  return dates;
}

export function monthKeyFromDateText(dateText: string) {
  return monthKey(new Date(`${dateText}T00:00:00`));
}

export function getAgendaReturnSelectedDate(
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

export function formatChineseCalendarDay(dateText: string) {
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

export function formatChineseCalendarDate(dateText: string) {
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

export function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
