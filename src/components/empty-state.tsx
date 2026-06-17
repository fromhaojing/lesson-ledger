import { Text, View } from "react-native";

import { useTheme } from "@/theme";

export function EmptyState({ title, description }: { title: string; description: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.line,
        borderRadius: 22,
        borderWidth: 1,
        gap: 8,
        padding: 24
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600" }}>{title}</Text>
      <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }}>
        {description}
      </Text>
    </View>
  );
}
