import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

const actions = [
  { title: "新增课程", href: "/lessons/create", color: "#14A38B" },
  { title: "导入课表", href: "/import", color: "#FFB84D" }
] as const;

export function QuickActions() {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {actions.map((action) => (
        <Link key={action.href} href={action.href} asChild>
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: action.color,
              borderCurve: "continuous",
              borderRadius: 18,
              flex: 1,
              minHeight: 56,
              justifyContent: "center",
              opacity: pressed ? 0.78 : 1,
              paddingHorizontal: 16
            })}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>{action.title}</Text>
            <Text style={{ color: "#FFFFFFCC", fontSize: 12, fontWeight: "500", marginTop: 3 }}>
              {action.href === "/import" ? "Excel 模板" : "手动记录"}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
