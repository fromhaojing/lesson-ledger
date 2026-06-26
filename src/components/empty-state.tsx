import { Text, View } from "react-native";

import { useTheme } from "@/theme";

export function EmptyState({ title, description }: { title: string; description: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        gap: 8,
        padding: 24,
        borderRadius: theme.radius.lg
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600" }}>{title}</Text>
      <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }}>
        {description}
      </Text>
    </View>
  );
}
