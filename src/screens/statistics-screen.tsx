import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import type { EChartsCoreOption } from "echarts/core";
import { useCallback, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";

import { EChart } from "@/components/e-chart";
import { EmptyState } from "@/components/empty-state";
import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import {
  getRangeStatistics,
  type Statistics,
} from "@/modules/statistics/statistics.service";
import { useStudentChart } from "@/screens/statistics/use-student-chart";
import { useTheme } from "@/theme";
import { monthRange } from "@/utils/date";
import { formatMoney } from "@/utils/money";

dayjs.locale("zh-cn");

export function StatisticsScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);
  const initialRange = monthRange(dayjs().format("YYYY-MM"));
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [stats, setStats] = useState<Statistics | null>(null);

  const load = useCallback(async () => {
    setStats(await getRangeStatistics(startDate, endDate));
  }, [endDate, startDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const studentChart = useStudentChart(stats);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView
        contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            borderCurve: "continuous",
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            padding: 14,
          }}
        >
          <DateRangePicker
            endDate={endDate}
            onChange={(nextStartDate, nextEndDate) => {
              setStartDate(nextStartDate);
              setEndDate(nextEndDate);
            }}
            startDate={startDate}
          />
        </View>

        <OverviewPanel
          amount={stats?.confirmedAmount ?? 0}
          cancelledCount={stats?.cancelledCount ?? 0}
          confirmedCount={stats?.confirmedCount ?? 0}
          dateRange={formatDateRange(startDate, endDate)}
          pendingCount={stats?.pendingCount ?? 0}
        />

        <ChartCard
          empty="这个日期范围内确认课程后，这里会显示学生参与课程排行。"
          hasData={(stats?.byStudent.length ?? 0) > 0}
          height={studentChart.height}
          option={studentChart.option}
          title="学生课次排行"
          width={chartWidth}
        />

        <StatsList
          title="学生明细"
          empty="这个日期范围内确认课程后，这里会显示每位学生参与的课程数。"
          rows={(stats?.byStudent ?? []).map((item) => ({
            name: item.name,
            detail: "参与课程",
            value: `${item.count} 节`,
          }))}
        />
      </SafeAreaScrollView>
    </View>
  );
}

function OverviewPanel({
  amount,
  cancelledCount,
  confirmedCount,
  dateRange,
  pendingCount,
}: {
  amount: number;
  cancelledCount: number;
  confirmedCount: number;
  dateRange: string;
  pendingCount: number;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.line,
        borderCurve: "continuous",
        borderRadius: 24,
        borderWidth: 1,
        gap: 16,
        padding: 18,
      }}
    >
      <View style={{ gap: 5 }}>
        <Text
          selectable
          style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "700" }}
        >
          {dateRange}
        </Text>
        <Text
          selectable
          adjustsFontSizeToFit
          numberOfLines={1}
          style={{ color: theme.colors.text, fontSize: 34, fontWeight: "800" }}
        >
          {formatMoney(amount)}
        </Text>
        <Text
          selectable
          style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "600" }}
        >
          已确认收入
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatTile label="确认课程" value={`${confirmedCount} 节`} />
        <StatTile label="待确认" value={`${pendingCount} 节`} tone="warning" />
        <StatTile
          label="已取消"
          value={`${cancelledCount} 节`}
          tone="muted"
        />
      </View>
    </View>
  );
}

function ChartCard({
  empty,
  hasData,
  height,
  option,
  title,
  width,
}: {
  empty: string;
  hasData: boolean;
  height: number;
  option: EChartsCoreOption;
  title: string;
  width: number;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text
        selectable
        style={{ color: theme.colors.text, fontSize: 19, fontWeight: "600" }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderCurve: "continuous",
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          minHeight: height,
          overflow: "hidden",
          paddingVertical: 10,
        }}
      >
        {hasData ? (
          <EChart
            option={option}
            themeName={theme.colors.surface}
            width={width - 2}
            height={height - 20}
          />
        ) : (
          <EmptyState title="暂无数据" description={empty} />
        )}
      </View>
    </View>
  );
}

function DateRangePicker({
  endDate,
  onChange,
  startDate,
}: {
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  startDate: string;
}) {
  const theme = useTheme();

  function changeStartDate(nextDate: Date) {
    const nextDateText = dayjs(nextDate).format("YYYY-MM-DD");
    onChange(
      nextDateText,
      dayjs(nextDateText).isAfter(endDate) ? nextDateText : endDate,
    );
  }

  function changeEndDate(nextDate: Date) {
    const nextDateText = dayjs(nextDate).format("YYYY-MM-DD");
    onChange(
      dayjs(nextDateText).isBefore(startDate) ? nextDateText : startDate,
      nextDateText,
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          selectable
          style={{ color: theme.colors.text, fontSize: 17, fontWeight: "700" }}
        >
          统计范围
        </Text>
      </View>
      <View
        style={{
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <DatePickerField
          label="开始日期"
          value={dateFromText(startDate)}
          onChange={changeStartDate}
        />
        <View
          style={{
            backgroundColor: theme.colors.line,
            height: 1,
            marginLeft: 14,
          }}
        />
        <DatePickerField
          label="结束日期"
          value={dateFromText(endDate)}
          onChange={changeEndDate}
        />
      </View>
    </View>
  );
}

function DatePickerField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (date: Date) => void;
  value: Date;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        // backgroundColor: theme.colors.background,
        flexDirection: "row",
        minHeight: 50,
        paddingLeft: 14,
        paddingRight: 8,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          flex: 1,
          fontSize: 16,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <DateTimePicker
        display="compact"
        locale="zh-Hans"
        mode="date"
        onChange={(_, nextDate) => {
          if (nextDate) onChange(nextDate);
        }}
        value={value}
      />
    </View>
  );
}

function StatTile({
  label,
  tone = "primary",
  value,
}: {
  label: string;
  tone?: "primary" | "success" | "warning" | "muted";
  value: string;
}) {
  const theme = useTheme();
  const color =
    tone === "warning"
      ? theme.colors.warning
      : tone === "muted"
        ? theme.colors.muted
        : tone === "success"
          ? theme.colors.success
          : theme.colors.primary;

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
        minHeight: 72,
        minWidth: 128,
        justifyContent: "center",
        padding: 12,
      }}
    >
      <Text
        selectable
        style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "700" }}
      >
        {label}
      </Text>
      <Text
        selectable
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          color,
          fontSize: 18,
          fontVariant: ["tabular-nums"],
          fontWeight: "800",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function StatsList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; detail: string; value: string }[];
  empty: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text
        selectable
        style={{ color: theme.colors.text, fontSize: 19, fontWeight: "600" }}
      >
        {title}
      </Text>
      {rows.length === 0 ? (
        <EmptyState title="暂无数据" description={empty} />
      ) : (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            borderCurve: "continuous",
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          {rows.map((row, index) => (
            <View
              key={`${row.name}-${row.detail}`}
              style={{
                alignItems: "center",
                borderBottomColor: theme.colors.line,
                borderBottomWidth: index < rows.length - 1 ? 1 : 0,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                minHeight: 58,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  selectable
                  style={{
                    color: theme.colors.text,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  {row.name}
                </Text>
                <Text
                  selectable
                  style={{ color: theme.colors.muted, fontSize: 13 }}
                >
                  {row.detail}
                </Text>
              </View>
              <Text
                selectable
                style={{
                  color: theme.colors.text,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function formatDateRange(startDate: string, endDate: string) {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (start.isSame(end, "day")) return start.format("YYYY 年 M 月 D 日");
  if (start.isSame(end, "year"))
    return `${start.format("YYYY 年 M 月 D 日")} - ${end.format("M 月 D 日")}`;
  return `${start.format("YYYY 年 M 月 D 日")} - ${end.format("YYYY 年 M 月 D 日")}`;
}

function dateFromText(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
