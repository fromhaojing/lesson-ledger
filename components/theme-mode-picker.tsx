import { Pressable, Text, View } from "react-native";

import { type ThemeMode, useTheme } from "@/theme";

const options: { label: string; value: ThemeMode }[] = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" }
];

export function ThemeModePicker({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceSoft,
        borderRadius: 16,
        flexDirection: "row",
        gap: 4,
        padding: 4
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: selected ? theme.colors.surface : "transparent",
              borderColor: selected ? theme.colors.line : "transparent",
              borderCurve: "continuous",
              borderRadius: 12,
              borderWidth: 1,
              flex: 1,
              minHeight: 38,
              justifyContent: "center",
              opacity: pressed ? 0.68 : 1
            })}
          >
            <Text
              style={{
                color: selected ? theme.colors.text : theme.colors.muted,
                fontSize: 14,
                fontWeight: selected ? "600" : "500"
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
