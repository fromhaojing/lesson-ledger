import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/empty-state";
import { LessonListItem } from "@/components/lesson-list-item";
import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { useTheme } from "@/theme";

export function PendingScreen() {
  const theme = useTheme();
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const load = useCallback(async () => {
    await lessonRepository.refreshPendingStatuses();
    setLessons(await lessonRepository.findPendingLessons());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
        {lessons.length === 0 ? (
          <EmptyState title="没有待确认课程" description="已经确认过的课程会进入统计页，未结束的课程会继续等待。" />
        ) : (
          lessons.map((lesson) => <LessonListItem key={lesson.id} lesson={lesson} />)
        )}
      </SafeAreaScrollView>
    </View>
  );
}
