import { PropsWithChildren, useEffect, useState } from "react";
import { Animated, Modal, Pressable, Text, TextInput, View, type PressableProps, type TextInputProps } from "react-native";
import { Host, Picker } from "@expo/ui";

import { useTheme } from "@/theme";
import type { LessonStatus } from "@/modules/lessons/lesson.types";

export function Card({ children, tone = "plain" }: PropsWithChildren<{ tone?: "plain" | "mint" | "dark" }>) {
  const theme = useTheme();
  const isDark = tone === "dark";
  return (
    <View
      style={{
        backgroundColor: isDark ? (theme.scheme === "dark" ? "#22313D" : theme.colors.text) : tone === "mint" ? theme.colors.surfaceSoft : theme.colors.surface,
        borderColor: isDark ? "transparent" : theme.colors.line,
        borderCurve: "continuous",
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        boxShadow: "0 8px 18px rgba(20, 33, 61, 0.045)",
        gap: 10,
        padding: 14
      }}
    >
      {children}
    </View>
  );
}

export function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, gap: 3, minWidth: 110 }}>
      <Text selectable style={{ color: muted ? theme.colors.muted : theme.colors.text, fontSize: 13, fontWeight: "500" }}>
        {label}
      </Text>
      <Text selectable style={{ color: theme.colors.text, fontSize: 23, fontVariant: ["tabular-nums"], fontWeight: "600" }}>
        {value}
      </Text>
    </View>
  );
}

export function RollingMetric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(1));
  const valueHeight = 30;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true
    });

    animation.start();

    return () => animation.stop();
  }, [progress, value]);

  return (
    <View style={{ flex: 1, gap: 3, minWidth: 110 }}>
      <Text selectable style={{ color: muted ? theme.colors.muted : theme.colors.text, fontSize: 13, fontWeight: "500" }}>
        {label}
      </Text>
      <View style={{ height: valueHeight, overflow: "hidden" }}>
        <Animated.Text
          key={value}
          selectable
          style={{
            color: theme.colors.text,
            fontSize: 23,
            fontVariant: ["tabular-nums"],
            fontWeight: "600",
            lineHeight: valueHeight,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [valueHeight, 0]
                })
              }
            ]
          }}
        >
          {value}
        </Animated.Text>
      </View>
    </View>
  );
}

export function PrimaryButton({
  children,
  variant = "primary",
  ...props
}: PropsWithChildren<PressableProps & { variant?: "primary" | "quiet" | "danger" }>) {
  const theme = useTheme();
  const backgroundColor = variant === "primary" ? theme.colors.primary : variant === "danger" ? theme.colors.danger : theme.colors.surfaceSoft;
  const color = variant === "quiet" ? theme.colors.primaryDark : "#FFFFFF";

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        {
          alignItems: "center",
          backgroundColor,
          borderCurve: "continuous",
          borderRadius: 16,
          minHeight: 50,
          justifyContent: "center",
          opacity: pressed ? 0.76 : props.disabled ? 0.46 : 1,
          paddingHorizontal: 18
        },
        typeof props.style === "function" ? props.style({ pressed, hovered: false }) : props.style
      ]}
    >
      <Text style={{ color, fontSize: 16, fontWeight: "600" }}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "500" }}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#A1AAB8"
        style={[
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            borderRadius: 16,
            borderWidth: 1,
            color: theme.colors.text,
            fontSize: 16,
            minHeight: 50,
            paddingHorizontal: 14
          },
          props.style
        ]}
      />
    </View>
  );
}

export function NumberWheelField({
  label,
  max = 500,
  min = 0,
  onChangeText,
  placeholder = "选择数字",
  suffix,
  value
}: {
  label: string;
  max?: number;
  min?: number;
  onChangeText: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  value: string;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const normalizedValue = normalizeNumberWheelValue(value, min, max);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "500" }}>{label}</Text>
      <Pressable
        onPress={() => setVisible(true)}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderCurve: "continuous",
          borderRadius: 16,
          borderWidth: 1,
          flexDirection: "row",
          minHeight: 50,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: 14
        })}
      >
          <Text style={{ color: value ? theme.colors.text : "#A1AAB8", flex: 1, fontSize: 16, fontVariant: ["tabular-nums"] }}>
          {value ? `${normalizedValue}${suffix ? ` ${suffix}` : ""}` : placeholder}
        </Text>
      </Pressable>
      {visible ? (
        <NumberWheelSheet
          initialValue={normalizedValue}
          label={label}
          max={max}
          min={min}
          onClose={() => setVisible(false)}
          onSelect={(nextValue) => {
            onChangeText(nextValue);
            setVisible(false);
          }}
          suffix={suffix}
        />
      ) : null}
    </View>
  );
}

function NumberWheelSheet({
  initialValue,
  label,
  max,
  min,
  onClose,
  onSelect,
  suffix
}: {
  initialValue: string;
  label: string;
  max: number;
  min: number;
  onClose: () => void;
  onSelect: (value: string) => void;
  suffix?: string;
}) {
  const theme = useTheme();
  const [draftValue, setDraftValue] = useState(initialValue);
  const options = Array.from({ length: max - min + 1 }, (_, index) => String(min + index));

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={{ backgroundColor: "rgba(0, 0, 0, 0.24)", flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "62%",
            paddingBottom: 24,
            paddingTop: 8
          }}
        >
          <View style={{ alignItems: "center", paddingBottom: 8 }}>
            <View style={{ backgroundColor: theme.colors.line, borderRadius: 999, height: 4, width: 42 }} />
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", minHeight: 44, paddingHorizontal: 18 }}>
            <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17, fontWeight: "600" }}>{label}</Text>
            <Pressable onPress={() => onSelect(draftValue)} hitSlop={10}>
              <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: "600" }}>完成</Text>
            </Pressable>
          </View>
          <View style={{ height: 220, justifyContent: "center", paddingHorizontal: 18 }}>
            <Host colorScheme={theme.scheme} style={{ flex: 1 }}>
              <Picker appearance="wheel" selectedValue={draftValue} onValueChange={setDraftValue}>
                {options.map((item) => (
                  <Picker.Item key={item} label={`${item}${suffix ? ` ${suffix}` : ""}`} value={item} />
                ))}
              </Picker>
            </Host>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function normalizeNumberWheelValue(value: string, min = 0, max = 500) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return String(min);
  return String(Math.min(max, Math.max(min, parsed)));
}

export function StatusPill({ status }: { status: LessonStatus | "active" }) {
  const theme = useTheme();
  const meta =
    {
      active: ["已开始", theme.colors.primary],
      scheduled: ["未开始", theme.colors.muted],
      pending: ["待确认", theme.colors.warning],
      confirmed: ["已确认", theme.colors.success],
      cancelled: ["已取消", theme.colors.danger],
      absent: ["缺勤", theme.colors.purple]
    }[status] ?? ["未知", theme.colors.muted];

  return (
    <View style={{ backgroundColor: `${meta[1]}18`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: meta[1], fontSize: 12, fontWeight: "600" }}>{meta[0]}</Text>
    </View>
  );
}
