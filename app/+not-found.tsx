import { Link } from "expo-router";
import { Text, View } from "react-native";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { useTheme } from "@/theme";

export default function NotFoundScreen() {
  const theme = useTheme();

  return (
    <SafeAreaScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 16 }}
      style={{ backgroundColor: theme.colors.background }}
    >
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: "600" }}>页面不存在</Text>
        <Text selectable style={{ color: theme.colors.muted, fontSize: 16, lineHeight: 24 }}>
          这个入口暂时不可用。
        </Text>
      </View>
      <Link href="/" style={{ color: theme.colors.primary, fontSize: 17, fontWeight: "500" }}>
        回到首页
      </Link>
    </SafeAreaScrollView>
  );
}
