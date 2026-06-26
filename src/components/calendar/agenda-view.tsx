import dayjs from "dayjs";
import { useLayoutEffect, useMemo, type RefObject } from "react";
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
  buildAgendaItemLayouts,
  getLessonStatusMeta,
  getListItemLayout,
  listViewabilityConfig,
  type AgendaSection,
  type CalendarPalette,
} from "@/components/calendar/calendar-utils";

export function AgendaView({
  availableHeight,
  bottomInset,
  contentWidth,
  currentToday,
  emptyDescription = "当前范围内没有课程安排。",
  emptyTitle = "暂无课程",
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
  availableHeight: number;
  bottomInset: number;
  contentWidth: number;
  currentToday: string;
  emptyDescription?: string;
  emptyTitle?: string;
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
  const targetIndex = useMemo(
    () => getAgendaTargetIndex(sections, selectedDate),
    [sections, selectedDate],
  );
  const itemLayouts = useMemo(
    () => buildAgendaItemLayouts(sections),
    [sections],
  );
  const initialScrollIndex = useMemo(
    () =>
      getCenteredInitialIndex({
        availableHeight,
        itemLayouts,
        targetIndex,
      }),
    [availableHeight, itemLayouts, targetIndex],
  );

  useLayoutEffect(() => {
    if (targetIndex < 0 || sections.length === 0) return;

    const scrollOptions = {
      animated: false,
      index: targetIndex,
      viewPosition: 0.45,
    };

    listRef.current?.scrollToIndex(scrollOptions);
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex(scrollOptions);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [listRef, sections.length, targetIndex]);

  return (
    <FlatList
      ref={listRef}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{
        backgroundColor: palette.background,
        paddingBottom: bottomInset + 18,
      }}
      data={sections}
      extraData={currentToday}
      getItemLayout={(_, index) => getListItemLayout(itemLayouts, index)}
      initialNumToRender={14}
      initialScrollIndex={sections.length > 0 ? initialScrollIndex : undefined}
      keyExtractor={(item) => item.dateText}
      ListEmptyComponent={
        <AgendaEmptyState
          description={emptyDescription}
          palette={palette}
          title={emptyTitle}
        />
      }
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
      style={{ backgroundColor: palette.background }}
      viewabilityConfig={listViewabilityConfig}
      windowSize={9}
    />
  );
}

function getAgendaTargetIndex(sections: AgendaSection[], selectedDate: string) {
  if (sections.length === 0) return -1;

  const nextIndex = sections.findIndex(
    (section) => section.dateText >= selectedDate,
  );
  return nextIndex >= 0 ? nextIndex : sections.length - 1;
}

function getCenteredInitialIndex({
  availableHeight,
  itemLayouts,
  targetIndex,
}: {
  availableHeight: number;
  itemLayouts: ReturnType<typeof buildAgendaItemLayouts>;
  targetIndex: number;
}) {
  if (targetIndex <= 0) return 0;

  const selectedLayout = itemLayouts[targetIndex];
  if (!selectedLayout || availableHeight <= 0) return targetIndex;

  const targetTopOffset = Math.max(
    0,
    selectedLayout.offset - availableHeight * 0.42,
  );
  let initialIndex = targetIndex;

  while (
    initialIndex > 0 &&
    itemLayouts[initialIndex].offset > targetTopOffset
  ) {
    initialIndex -= 1;
  }

  return initialIndex;
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
        backgroundColor: palette.background,
        paddingLeft: 18,
        paddingRight: 18,
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

function AgendaEmptyState({
  description,
  palette,
  title,
}: {
  description: string;
  palette: CalendarPalette;
  title: string;
}) {
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
        {title}
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
        {description}
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
