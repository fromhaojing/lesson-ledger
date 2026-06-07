import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/empty-state";
import { LessonListItem } from "@/components/lesson-list-item";
import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Card } from "@/components/ui";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { Lesson } from "@/modules/lessons/lesson.types";
import { getMonthStatistics } from "@/modules/statistics/statistics.service";
import { useTheme } from "@/theme";
import { monthKey, todayText } from "@/utils/date";
import { formatMoney } from "@/utils/money";

export function HomeScreen() {
  const theme = useTheme();
  const [todayLessons, setTodayLessons] = useState<Lesson[]>([]);
  const [confirmedToday, setConfirmedToday] = useState(0);
  const [expectedToday, setExpectedToday] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await lessonRepository.refreshPendingStatuses();
    const [lessons, stats] = await Promise.all([
      lessonRepository.findByDate(todayText()),
      getMonthStatistics(monthKey())
    ]);
    setTodayLessons(lessons.filter((lesson) => lesson.status !== "confirmed"));
    setConfirmedToday(
      lessons
        .filter((lesson) => lesson.status === "confirmed")
        .reduce((total, lesson) => total + (lesson.finalAmount ?? 0), 0)
    );
    setExpectedToday(
      lessons
        .filter((lesson) => lesson.status !== "confirmed")
        .reduce((total, lesson) => total + (lesson.defaultAmount ?? 0), 0)
    );
    setPendingCount(stats.pendingCount);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const timer = setInterval(load, 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surfaceSoft,
            borderColor: theme.colors.line,
            borderCurve: "continuous",
            borderRadius: 24,
            borderWidth: 1,
            gap: 14,
            padding: 18
          }}
        >
          <View style={{ gap: 5 }}>
            <Text selectable style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "600" }}>
              {formatTodayLabel()}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <HomeAmount label="预计收入" value={formatMoney(expectedToday)} />
            <HomeAmount label="已确认" value={formatMoney(confirmedToday)} />
          </View>
        </View>

        {pendingCount > 0 ? (
          <Link href="/pending" asChild>
            <Pressable>
              <Card tone="dark">
                <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>还有 {pendingCount} 节待确认</Text>
                    <Text selectable style={{ color: "#D7DEE8", fontSize: 14, lineHeight: 20 }}>
                      处理完后，今日与统计数据会自动更新。
                    </Text>
                  </View>
                  <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "300" }}>›</Text>
                </View>
              </Card>
            </Pressable>
          </Link>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: "600" }}>今日课程</Text>
          {todayLessons.length === 0 ? (
            <EmptyState title="今天还没有课程" description="可以放松一下，打打游戏，逛逛街" />
          ) : (
            todayLessons.map((lesson) => <LessonListItem key={lesson.id} lesson={lesson} />)
          )}
        </View>
      </SafeAreaScrollView>
    </View>
  );
}

function HomeAmount({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.line,
        borderCurve: "continuous",
        borderRadius: 18,
        borderWidth: 1,
        flex: 1,
        gap: 5,
        minHeight: 76,
        justifyContent: "center",
        padding: 13
      }}
    >
      <Text selectable style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
      <Text selectable adjustsFontSizeToFit numberOfLines={1} style={{ color: theme.colors.text, fontSize: 18, fontWeight: "700" }}>
        {value}
      </Text>
    </View>
  );
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
}
