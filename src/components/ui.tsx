import { PropsWithChildren, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Host, Picker } from "@expo/ui";
import {
  Button as NativeButton,
  Host as NativeHost,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { useTheme } from "@/theme";
import type { LessonStatus } from "@/modules/lessons/lesson.types";
import {
  DEFAULT_NUMBER_WHEEL_MAX,
  DEFAULT_NUMBER_WHEEL_MIN,
  DEFAULT_NUMBER_WHEEL_STEP,
  normalizeNumberWheelValue,
} from "@/utils/number";

export {
  DEFAULT_NUMBER_WHEEL_MAX,
  DEFAULT_NUMBER_WHEEL_MIN,
  DEFAULT_NUMBER_WHEEL_STEP,
  normalizeNumberWheelValue,
} from "@/utils/number";

export function Card({
  children,
  tone = "plain",
}: PropsWithChildren<{ tone?: "plain" | "mint" | "dark" }>) {
  const theme = useTheme();
  const isDark = tone === "dark";
  return (
    <View
      style={{
        backgroundColor: isDark
          ? theme.scheme === "dark"
            ? "#22313D"
            : theme.colors.text
          : tone === "mint"
            ? theme.colors.surfaceSoft
            : theme.colors.surface,
        borderColor: isDark ? "transparent" : theme.colors.line,
        borderCurve: "continuous",
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        gap: 10,
        padding: 14,
      }}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  children,
  disabled = false,
  onPress,
  variant = "primary",
}: PropsWithChildren<{
  disabled?: boolean;
  onPress?: () => void;
  variant?: "primary" | "quiet" | "danger" | "glass";
}>) {
  const theme = useTheme();
  const label = buttonLabel(children);
  const style =
    variant === "primary"
      ? "borderedProminent"
      : variant === "glass"
        ? "glass"
        : "bordered";
  const tintColor =
    variant === "danger"
      ? theme.colors.danger
      : variant === "quiet"
        ? theme.colors.primaryDark
        : theme.colors.primary;

  return (
    <NativeHost matchContents>
      <NativeButton
        label={label}
        modifiers={[
          buttonStyle(style),
          controlSize("large"),
          tint(tintColor),
          disabledModifier(disabled),
        ]}
        onPress={disabled ? undefined : onPress}
        role={variant === "danger" ? "destructive" : "default"}
      />
    </NativeHost>
  );
}

function buttonLabel(children: PropsWithChildren["children"]) {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children
      .filter((child) => typeof child === "string" || typeof child === "number")
      .join("");
  }
  return "";
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "500" }}
      >
        {label}
      </Text>
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
            paddingHorizontal: 14,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function NumberWheelField({
  label,
  max = DEFAULT_NUMBER_WHEEL_MAX,
  min = DEFAULT_NUMBER_WHEEL_MIN,
  onChangeText,
  placeholder = "选择数字",
  step = DEFAULT_NUMBER_WHEEL_STEP,
  suffix,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onChangeText: (value: string) => void;
  placeholder?: string;
  step?: number;
  suffix?: string;
  value: string;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const normalizedValue = normalizeNumberWheelValue(value, min, max, step);

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "500" }}
      >
        {label}
      </Text>
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
          paddingHorizontal: 14,
        })}
      >
        <Text
          style={{
            color: value ? theme.colors.text : "#A1AAB8",
            flex: 1,
            fontSize: 16,
            fontVariant: ["tabular-nums"],
          }}
        >
          {value
            ? `${normalizedValue}${suffix ? ` ${suffix}` : ""}`
            : placeholder}
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
          step={step}
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
  step,
  suffix,
}: {
  initialValue: string;
  label: string;
  max: number;
  min: number;
  onClose: () => void;
  onSelect: (value: string) => void;
  step: number;
  suffix?: string;
}) {
  const theme = useTheme();
  const [draftValue, setDraftValue] = useState(initialValue);
  const normalizedStep = Math.max(1, Math.round(step));
  const options = Array.from(
    { length: Math.floor((max - min) / normalizedStep) + 1 },
    (_, index) => String(min + index * normalizedStep),
  );

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <Pressable
        onPress={onClose}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.24)",
          flex: 1,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "62%",
            paddingBottom: 24,
            paddingTop: 8,
          }}
        >
          <View style={{ alignItems: "center", paddingBottom: 8 }}>
            <View
              style={{
                backgroundColor: theme.colors.line,
                borderRadius: 999,
                height: 4,
                width: 42,
              }}
            />
          </View>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              minHeight: 44,
              paddingHorizontal: 18,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                flex: 1,
                fontSize: 17,
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
            <Pressable onPress={() => onSelect(draftValue)} hitSlop={10}>
              <Text
                style={{
                  color: theme.colors.primary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                完成
              </Text>
            </Pressable>
          </View>
          <View
            style={{
              height: 220,
              justifyContent: "center",
              paddingHorizontal: 18,
            }}
          >
            <Host colorScheme={theme.scheme} style={{ flex: 1 }}>
              <Picker
                appearance="wheel"
                selectedValue={draftValue}
                onValueChange={setDraftValue}
              >
                {options.map((item) => (
                  <Picker.Item
                    key={item}
                    label={`${item}${suffix ? ` ${suffix}` : ""}`}
                    value={item}
                  />
                ))}
              </Picker>
            </Host>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function StatusPill({ status }: { status: LessonStatus | "active" }) {
  const theme = useTheme();
  const meta = {
    active: ["已开始", theme.colors.primary],
    scheduled: ["未开始", theme.colors.muted],
    pending: ["待确认", theme.colors.warning],
    confirmed: ["已确认", theme.colors.success],
    cancelled: ["已取消", theme.colors.danger],
  }[status] ?? ["未知", theme.colors.muted];

  return (
    <View
      style={{
        backgroundColor: `${meta[1]}18`,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: meta[1], fontSize: 12, fontWeight: "600" }}>
        {meta[0]}
      </Text>
    </View>
  );
}
