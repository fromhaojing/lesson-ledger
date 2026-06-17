import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useTheme } from "@/theme";

const actions = [
  {
    title: "新增课程",
    description: "手动记录一节课",
    href: "/lessons/create" as const
  },
  {
    title: "导入课表",
    description: "从 Excel 批量导入",
    href: "/import" as const
  }
];

export function HeaderCreateMenu() {
  const router = useRouter();
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  function navigate(href: (typeof actions)[number]["href"]) {
    setVisible(false);
    requestAnimationFrame(() => {
      router.push(href);
    });
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="创建"
        onPress={() => setVisible(true)}
        style={({ pressed }) => ({
          alignItems: "center",
          borderRadius: 18,
          height: 36,
          justifyContent: "center",
          opacity: pressed ? 0.55 : 1,
          width: 36
        })}
      >
        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: "300", lineHeight: 32 }}>+</Text>
      </Pressable>

      <Modal animationType="slide" onRequestClose={() => setVisible(false)} transparent visible={visible}>
        <Pressable
          onPress={() => setVisible(false)}
          style={{ backgroundColor: "rgba(20, 33, 61, 0.2)", flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              gap: 12,
              paddingBottom: 34,
              paddingHorizontal: 18,
              paddingTop: 14
            }}
          >
            <View style={{ alignSelf: "center", backgroundColor: "#CBD5E1", borderRadius: 999, height: 4, width: 38 }} />
            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600", paddingTop: 4 }}>新建</Text>

            {actions.map((action) => (
              <Pressable
                key={action.href}
                onPress={() => navigate(action.href)}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.line,
                  borderCurve: "continuous",
                  borderRadius: 18,
                  borderWidth: 1,
                  gap: 4,
                  opacity: pressed ? 0.72 : 1,
                  padding: 16
                })}
              >
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}>{action.title}</Text>
                <Text style={{ color: theme.colors.muted, fontSize: 13 }}>{action.description}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => ({
                alignItems: "center",
                borderRadius: 16,
                opacity: pressed ? 0.6 : 1,
                padding: 14
              })}
            >
              <Text style={{ color: theme.colors.muted, fontSize: 15, fontWeight: "500" }}>取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
