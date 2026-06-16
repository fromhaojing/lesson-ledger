import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Card, Field, NumberWheelField, PrimaryButton, normalizeNumberWheelValue } from "@/components/ui";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { useTheme } from "@/theme";
import { formatTimeRange } from "@/utils/date";
import { formatMoney, parseAmount } from "@/utils/money";

export function LessonConfirmScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const next = await lessonRepository.findById(id);
    setLesson(next);
    if (next) setAmount(String(next.finalAmount ?? next.defaultAmount));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function confirm(value = amount) {
    if (!lesson) return;
    try {
      await lessonRepository.confirmAmount(lesson.id, parseAmount(normalizeNumberWheelValue(value)), note || undefined);
      await syncLessonNotifications();
      await syncPendingLessonBadge();
      closeConfirmScreen(lesson.id);
    } catch (error) {
      Alert.alert("确认失败", error instanceof Error ? error.message : "请检查金额。");
    }
  }

  function closeConfirmScreen(lessonId: string) {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(`/lessons/${lessonId}`);
  }

  if (!lesson) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  const canConfirm = ["scheduled", "pending"].includes(lesson.status);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        <Card tone="mint">
          <Text selectable style={{ color: theme.colors.text, fontSize: 24, fontWeight: "600" }}>{lesson.title}</Text>
          <Text selectable style={{ color: theme.colors.muted, fontSize: 15 }}>
            {lesson.dateText}  {formatTimeRange(lesson.startAt, lesson.endAt)}
          </Text>
          <Text selectable style={{ color: theme.colors.text, fontSize: 20, fontWeight: "600" }}>
            默认 {formatMoney(lesson.defaultAmount)}
          </Text>
        </Card>

        {canConfirm ? (
          <Card>
            <NumberWheelField label="实际金额" value={amount} onChangeText={setAmount} suffix="元" placeholder="选择金额" />
            <Field label="备注" value={note} onChangeText={setNote} placeholder="可选" />
            <PrimaryButton onPress={() => confirm()}>确认</PrimaryButton>
          </Card>
        ) : (
          <Card>
            <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600" }}>
              这节课已经处理过了
            </Text>
            <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 22 }}>
              已确认、已取消或缺勤的课程不能再次确认金额。
            </Text>
            <PrimaryButton variant="quiet" onPress={() => closeConfirmScreen(lesson.id)}>
              返回课程详情
            </PrimaryButton>
          </Card>
        )}
      </SafeAreaScrollView>
    </View>
  );
}
