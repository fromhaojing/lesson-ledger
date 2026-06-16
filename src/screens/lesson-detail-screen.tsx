import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Card, PrimaryButton, StatusPill } from "@/components/ui";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson, LessonStatus } from "@/modules/lessons/lesson.types";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { useTheme } from "@/theme";
import { formatTimeRange } from "@/utils/date";
import { formatMoney } from "@/utils/money";

export function LessonDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const load = useCallback(async () => {
    if (id) setLesson(await lessonRepository.findById(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markCancelled() {
    if (!lesson) return;
    Alert.alert("取消课程", "取消后这节课的金额会记为 0。", [
      { text: "取消", style: "cancel" },
      {
        text: "取消课程",
        style: "destructive",
        onPress: async () => {
          await lessonRepository.markCancelled(lesson.id);
          await syncLessonNotifications();
          await syncPendingLessonBadge();
          await load();
        }
      }
    ]);
  }

  async function markAbsent() {
    if (!lesson) return;
    Alert.alert("标记缺勤", "标记后这节课会进入未完成统计，金额会记为 0。", [
      { text: "取消", style: "cancel" },
      {
        text: "标记缺勤",
        style: "destructive",
        onPress: async () => {
          await lessonRepository.markAbsent(lesson.id, 0);
          await syncLessonNotifications();
          await syncPendingLessonBadge();
          await load();
        }
      }
    ]);
  }

  function confirmAmount() {
    if (!lesson) return;
    router.push(`/lessons/${lesson.id}/confirm`);
  }

  if (!lesson) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SafeAreaView edges={["bottom"]} style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <PrimaryButton variant="quiet" onPress={() => router.back()}>返回</PrimaryButton>
        </SafeAreaView>
      </View>
    );
  }

  const canAct = !["confirmed", "cancelled", "absent"].includes(lesson.status);
  const displayStatus = getDisplayStatus(lesson);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        <Card tone="mint">
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text selectable style={{ color: theme.colors.text, fontSize: 22, fontWeight: "600" }}>{lesson.title}</Text>
              <Text selectable style={{ color: theme.colors.muted, fontSize: 15 }}>
                {lesson.dateText}  {formatTimeRange(lesson.startAt, lesson.endAt)}
              </Text>
            </View>
            <StatusPill status={displayStatus} />
          </View>
        </Card>

        <Card>
          <Detail label="学生" value={lesson.studentNames.join("、")} />
          <Detail label="年级" value={lesson.grade || "未填写"} />
          <Detail label="课程类型" value={lesson.courseType || "未分类"} />
          <Detail label="默认金额" value={formatMoney(lesson.defaultAmount)} />
          <Detail label="实际金额" value={lesson.finalAmount === null ? "未确认" : formatMoney(lesson.finalAmount)} />
          <Detail label="备注" value={lesson.note || "无"} />
        </Card>

        {canAct ? (
          <View style={{ gap: 10 }}>
            <PrimaryButton onPress={confirmAmount}>
              确认金额
            </PrimaryButton>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PrimaryButton variant="quiet" onPress={markAbsent} style={{ flex: 1 }}>
                标记缺勤
              </PrimaryButton>
              <PrimaryButton variant="danger" onPress={markCancelled} style={{ flex: 1 }}>
                取消课程
              </PrimaryButton>
            </View>
          </View>
        ) : null}
      </SafeAreaScrollView>
    </View>
  );
}

function getDisplayStatus(lesson: Lesson): LessonStatus | "active" {
  const now = Date.now();
  const startAt = new Date(lesson.startAt).getTime();
  const endAt = new Date(lesson.endAt).getTime();
  if (lesson.status === "scheduled" && now >= startAt && now < endAt) return "active";
  return lesson.status;
}

function Detail({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: theme.colors.muted, fontSize: 14, fontWeight: "500" }}>{label}</Text>
      <Text selectable style={{ color: theme.colors.text, flex: 1, fontSize: 15, fontWeight: "500", textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}
