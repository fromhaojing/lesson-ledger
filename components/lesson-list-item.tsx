import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { Card, StatusPill } from "@/components/ui";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { useTheme } from "@/theme";
import { formatTimeRange } from "@/utils/date";
import { formatMoney } from "@/utils/money";

export function LessonListItem({ lesson, compact = false }: { lesson: Lesson; compact?: boolean }) {
  const theme = useTheme();
  const displayStatus = getDisplayStatus(lesson);

  return (
    <Link href={`/lessons/${lesson.id}`} asChild>
      <Pressable>
        <Card>
          <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text selectable style={{ color: theme.colors.text, fontSize: compact ? 16 : 18, fontWeight: "600" }}>
                {lesson.title}
              </Text>
              <Text selectable style={{ color: theme.colors.muted, fontSize: 14 }}>
                {lesson.dateText}  {formatTimeRange(lesson.startAt, lesson.endAt)}
              </Text>
              <Text selectable style={{ color: theme.colors.muted, fontSize: 14 }}>
                {[lesson.grade, lesson.courseType].filter(Boolean).join(" · ") || "普通课程"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <StatusPill status={displayStatus} />
              <Text selectable style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}>
                {formatMoney(lesson.finalAmount ?? lesson.defaultAmount)}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

function getDisplayStatus(lesson: Lesson) {
  const now = Date.now();
  const startAt = new Date(lesson.startAt).getTime();
  const endAt = new Date(lesson.endAt).getTime();
  if (lesson.status === "scheduled" && now >= startAt && now < endAt) return "active";
  return lesson.status;
}
