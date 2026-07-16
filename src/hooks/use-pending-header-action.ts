import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

import { lessonRepository } from "@/modules/lessons/lesson.repository";
import {
  getPendingLessonBadgeCount,
  subscribePendingLessonBadgeCount,
  syncPendingLessonBadge,
} from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";

export function usePendingHeaderAction({
  pathname,
  ready,
}: {
  pathname: string;
  ready: boolean;
}) {
  const [pendingHeaderCount, setPendingHeaderCount] = useState(0);
  const [confirmingPendingLessons, setConfirmingPendingLessons] =
    useState(false);

  const loadPendingHeaderCount = useCallback(async () => {
    try {
      setPendingHeaderCount(await getPendingLessonBadgeCount());
    } catch (error) {
      console.warn("Failed to load pending count", error);
    }
  }, []);

  const confirmPendingLessons = useCallback(async (lessonIds: string[]) => {
    setConfirmingPendingLessons(true);
    try {
      const confirmedCount =
        await lessonRepository.confirmManyWithDefaultAmounts(lessonIds);
      await syncLessonNotifications();
      await syncPendingLessonBadge();
      Alert.alert("确认完成", `已确认 ${confirmedCount} 节课程。`);
    } catch (error) {
      Alert.alert(
        "确认失败",
        error instanceof Error ? error.message : "请稍后再试。",
      );
    } finally {
      setConfirmingPendingLessons(false);
    }
  }, []);

  const confirmAllPendingLessons = useCallback(async () => {
    if (confirmingPendingLessons) return;

    try {
      await lessonRepository.refreshPendingStatuses();
      const lessons = await lessonRepository.findPendingLessons();
      const lessonIds = lessons.map((lesson) => lesson.id);
      setPendingHeaderCount(lessonIds.length);

      if (lessonIds.length === 0) {
        Alert.alert("没有待确认课程", "当前页面没有需要确认的课程。");
        return;
      }

      Alert.alert(
        "确认全部课程",
        `将按当前金额确认当前页面的 ${lessonIds.length} 节课程。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "全部确认",
            onPress: () => {
              void confirmPendingLessons(lessonIds);
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "确认失败",
        error instanceof Error ? error.message : "请稍后再试。",
      );
    }
  }, [confirmPendingLessons, confirmingPendingLessons]);

  useEffect(() => {
    if (!ready) return;

    const timer = setTimeout(loadPendingHeaderCount, 0);
    const unsubscribe =
      subscribePendingLessonBadgeCount(setPendingHeaderCount);

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [loadPendingHeaderCount, pathname, ready]);

  return {
    confirmAllPendingLessons,
    confirmingPendingLessons,
    pendingHeaderCount,
  };
}
