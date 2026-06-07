import dayjs from "dayjs";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme";

export function MonthStrip({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const theme = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
      <Pressable onPress={() => onChange(dayjs(`${value}-01`).subtract(1, "month").format("YYYY-MM"))} hitSlop={12}>
        <Text style={{ color: theme.colors.primary, fontSize: 24, fontWeight: "500" }}>‹</Text>
      </Pressable>
      <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600" }}>
        {dayjs(`${value}-01`).format("YYYY 年 M 月")}
      </Text>
      <Pressable onPress={() => onChange(dayjs(`${value}-01`).add(1, "month").format("YYYY-MM"))} hitSlop={12}>
        <Text style={{ color: theme.colors.primary, fontSize: 24, fontWeight: "500" }}>›</Text>
      </Pressable>
    </View>
  );
}
