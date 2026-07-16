import { useEffect, useRef } from "react";
import { BarChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import type { ECharts, EChartsCoreOption } from "echarts/core";
import SvgChart, { SVGRenderer } from "@wuba/react-native-echarts/svgChart";

echarts.use([SVGRenderer, BarChart, GridComponent]);

export function EChart({
  height,
  option,
  themeName,
  width,
}: {
  height: number;
  option: EChartsCoreOption;
  themeName: string;
  width: number;
}) {
  const chartRef = useRef<any>(null);
  const chartInstanceRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    chartInstanceRef.current?.dispose();
    const chart = echarts.init(chartRef.current, themeName, {
      height,
      renderer: "svg",
      width,
    });
    chart.setOption(option, true);
    chartInstanceRef.current = chart;

    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, [height, option, themeName, width]);

  return <SvgChart ref={chartRef} handleGesture style={{ width, height }} />;
}
