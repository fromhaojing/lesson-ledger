import dayjs from "dayjs";
import { Pressable, Text, View } from "react-native";

import type { Lesson } from "@/modules/lessons/lesson.types";
import { useTheme } from "@/theme";

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarMonthGrid({
  month,
  lessons,
  selectedDate,
  onSelectDate
}: {
  month: string;
  lessons: Lesson[];
  selectedDate: string;
  onSelectDate: (dateText: string) => void;
}) {
  const theme = useTheme();
  const start = dayjs(`${month}-01`);
  const offset = (start.day() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => start.subtract(offset, "day").add(index, "day"));

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row" }}>
        {weekDays.map((day) => (
          <Text key={day} style={{ color: theme.colors.muted, flex: 1, fontSize: 12, fontWeight: "500", textAlign: "center" }}>
            {day}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
        {cells.map((date) => {
          const dateText = date.format("YYYY-MM-DD");
          const dayLessons = lessons.filter((lesson) => lesson.dateText === dateText);
          const active = selectedDate === dateText;
          const muted = date.format("YYYY-MM") !== month;
          return (
            <Pressable
              key={dateText}
              onPress={() => onSelectDate(dateText)}
              style={{
                alignItems: "center",
                backgroundColor: active ? theme.colors.primary : "transparent",
                borderRadius: 16,
                height: 54,
                justifyContent: "center",
                width: `${100 / 7}%`
              }}
            >
              <Text style={{ color: active ? "#FFFFFF" : muted ? "#A9B2C1" : theme.colors.text, fontSize: 15, fontWeight: "500" }}>
                {date.date()}
              </Text>
              <View style={{ flexDirection: "row", gap: 3, height: 8, marginTop: 3 }}>
                {dayLessons.slice(0, 3).map((lesson) => (
                  <View
                    key={lesson.id}
                    style={{
                      backgroundColor: lesson.status === "pending" ? theme.colors.warning : active ? "#FFFFFF" : theme.colors.primary,
                      borderRadius: 999,
                      height: 5,
                      width: 5
                    }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
