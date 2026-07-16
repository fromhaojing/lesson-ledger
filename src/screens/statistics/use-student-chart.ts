import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import type { Statistics } from "@/modules/statistics/statistics.service";
import { useTheme } from "@/theme";

export function useStudentChart(stats: Statistics | null) {
  const theme = useTheme();
  const rows = useMemo(
    () => stats?.byStudent.slice(0, 10) ?? [],
    [stats?.byStudent],
  );
  const height = Math.max(330, rows.length * 48 + 104);
  const option = useMemo(
    () =>
      buildStudentOption({
        axisColor: theme.colors.muted,
        barColor: theme.colors.purple,
        data: rows,
        lineColor: theme.colors.line,
        textColor: theme.colors.text,
      }),
    [
      rows,
      theme.colors.line,
      theme.colors.muted,
      theme.colors.purple,
      theme.colors.text,
    ],
  );

  return { height, option };
}

function buildStudentOption({
  axisColor,
  barColor,
  data,
  lineColor,
  textColor,
}: {
  axisColor: string;
  barColor: string;
  data: Statistics["byStudent"];
  lineColor: string;
  textColor: string;
}): EChartsCoreOption {
  return {
    color: [barColor],
    grid: { bottom: 34, left: 22, right: 52, top: 22, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: axisColor, fontSize: 12 },
      axisLine: { lineStyle: { color: lineColor } },
      splitLine: { lineStyle: { color: lineColor, type: "dashed" } },
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      inverse: true,
      axisLabel: {
        color: textColor,
        fontSize: 13,
        fontWeight: 600,
        width: 82,
        overflow: "truncate",
      },
      axisLine: { lineStyle: { color: lineColor } },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barCategoryGap: "42%",
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 9, 9, 0], color: barColor },
        label: {
          show: true,
          position: "right",
          color: axisColor,
          fontSize: 12,
          distance: 10,
          formatter: "{c} 节",
        },
        data: data.map((item) => item.count),
      },
    ],
  };
}
