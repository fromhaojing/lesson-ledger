import { useCallback, useState, type ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import { Button as NativeButton, Host as NativeHost } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Field, NumberWheelField, normalizeNumberWheelValue } from "@/components/ui";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { useTheme } from "@/theme";
import { formatTimeRange } from "@/utils/date";
import { parseAmount } from "@/utils/money";

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
      <SafeAreaScrollView
        bottomOffset={132}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
      >
        <View style={{ gap: 6, paddingHorizontal: 4, paddingVertical: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 22, fontWeight: "600" }}>{lesson.title}</Text>
          <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
            {lesson.dateText}  {formatTimeRange(lesson.startAt, lesson.endAt)}
          </Text>
        </View>

        {canConfirm ? (
          <FormGroup>
            <NumberWheelField label="实际金额" value={amount} onChangeText={setAmount} suffix="元" placeholder="选择金额" />
            <Field label="备注" value={note} onChangeText={setNote} placeholder="可选" />
          </FormGroup>
        ) : (
          <FormGroup>
            <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600" }}>
              这节课已经处理过了
            </Text>
            <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 22 }}>
              已确认或已取消的课程不能再次确认金额。
            </Text>
          </FormGroup>
        )}
      </SafeAreaScrollView>

      <SafeAreaView
        edges={["bottom"]}
        pointerEvents="box-none"
        style={{
          alignItems: "center",
          bottom: 0,
          left: 0,
          paddingBottom: 18,
          paddingHorizontal: 20,
          paddingTop: 20,
          position: "absolute",
          right: 0,
        }}
      >
        <NativeHost matchContents>
          <NativeButton
            label={canConfirm ? "确认金额" : "返回课程详情"}
            modifiers={[
              buttonStyle("glass"),
              controlSize("large"),
              tint(canConfirm ? theme.colors.primary : theme.colors.primaryDark),
            ]}
            onPress={() =>
              canConfirm ? confirm() : closeConfirmScreen(lesson.id)
            }
          />
        </NativeHost>
      </SafeAreaView>
    </View>
  );
}

function FormGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderCurve: "continuous",
        borderRadius: 30,
        gap: 12,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}
