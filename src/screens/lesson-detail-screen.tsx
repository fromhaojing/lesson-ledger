import { useCallback, useState, type ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import { Button as NativeButton, Host as NativeHost } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { StatusPill } from "@/components/ui";
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

  function openConfirmScreen() {
    if (!lesson) return;
    router.push(`/lessons/${lesson.id}/confirm`);
  }

  if (!lesson) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
    );
  }

  const canAct = !["confirmed", "cancelled"].includes(lesson.status);
  const canConfirm = lesson.status === "pending";
  const displayStatus = getDisplayStatus(lesson);
  const courseInfo =
    [lesson.grade, lesson.courseType].filter(Boolean).join(" · ") ||
    "普通课程";
  const amount = formatMoney(lesson.finalAmount ?? lesson.defaultAmount);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView
        bottomOffset={canAct ? 132 : 32}
        contentContainerStyle={{ gap: 24, paddingHorizontal: 36 }}
      >
        <View style={{ gap: 12, paddingTop: 8 }}>
          <Text selectable style={{ color: theme.colors.text, fontSize: 24, fontWeight: "800" }}>
            {lesson.title}
          </Text>
          <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: "500", lineHeight: 23 }}>
            {lesson.dateText}  {formatTimeRange(lesson.startAt, lesson.endAt)}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <StatusPill status={displayStatus} />
          </View>
        </View>

        <InfoGroup>
          <Detail label="课程" value={courseInfo} />
          <Detail label="金额" value={amount} />
          <Detail label="备注" value={lesson.note || "无"} muted={!lesson.note} />
        </InfoGroup>
      </SafeAreaScrollView>

      {canAct ? (
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
          <View style={{ borderRadius: 999, flexDirection: "row", gap: 10 }}>
            <NativeHost matchContents>
              <NativeButton
                label="取消课程"
                modifiers={[
                  buttonStyle("glass"),
                  controlSize("large"),
                  tint(theme.colors.danger),
                ]}
                onPress={markCancelled}
                role="destructive"
              />
            </NativeHost>
            {canConfirm ? (
              <NativeHost matchContents>
                <NativeButton
                  label="确认金额"
                  modifiers={[
                    buttonStyle("glass"),
                    controlSize("large"),
                    tint(theme.colors.primary),
                  ]}
                  onPress={openConfirmScreen}
                />
              </NativeHost>
            ) : null}
          </View>
        </SafeAreaView>
      ) : null}
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

function InfoGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderCurve: "continuous",
        borderRadius: 30,
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 24,
      }}
    >
      {children}
    </View>
  );
}

function Detail({
  label,
  muted = false,
  value,
}: {
  label: string;
  muted?: boolean;
  value: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 16 }}>
      <Text style={{ color: theme.colors.muted, fontSize: 15, fontWeight: "600", width: 48 }}>{label}</Text>
      <Text
        selectable
        style={{
          color: muted ? theme.colors.muted : theme.colors.text,
          flex: 1,
          fontSize: 16,
          fontWeight: "600",
          lineHeight: 22,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}
