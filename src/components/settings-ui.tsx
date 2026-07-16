import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import {
  Pressable,
  Switch,
  Text,
  View,
  type ColorValue,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { useTheme } from "@/theme";

export function SettingsDetail({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <SafeAreaScrollView
      contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}
      style={{ backgroundColor: theme.colors.background, flex: 1 }}
    >
      {children}
    </SafeAreaScrollView>
  );
}

export function SettingsGroup({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const theme = useTheme();
  const childArray = Children.toArray(children);

  return (
    <View style={{ gap: 5, marginBottom: title ? 0 : 14 }}>
      {title ? (
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 13,
            paddingHorizontal: 16,
            textTransform: "uppercase",
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderCurve: "continuous",
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {childArray.map((child, index) =>
          isValidElement<{ showDivider?: boolean }>(child) &&
          child.type === SettingsRow
            ? cloneElement(child, {
                showDivider: index < childArray.length - 1,
              })
            : child,
        )}
      </View>
    </View>
  );
}

export function SettingsRow({
  icon,
  iconBackground,
  onPress,
  showDivider = true,
  title,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: ColorValue;
  onPress: () => void;
  showDivider?: boolean;
  title: string;
  value: string;
}) {
  const theme = useTheme();
  const separatorColor = theme.colors.line;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 46,
        paddingLeft: 16,
        paddingRight: 12,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: iconBackground,
          borderCurve: "continuous",
          borderRadius: 7,
          height: 29,
          justifyContent: "center",
          width: 29,
        }}
      >
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </View>
      <View
        style={{
          alignItems: "center",
          borderBottomColor: separatorColor,
          borderBottomWidth: showDivider ? 1 : 0,
          flex: 1,
          flexDirection: "row",
          gap: 8,
          marginLeft: 12,
          minHeight: 46,
        }}
      >
        <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.muted, fontSize: 17, maxWidth: 190 }}
        >
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />
      </View>
    </Pressable>
  );
}

export function ChoiceRow({
  onPress,
  selected,
  title,
}: {
  onPress: () => void;
  selected: boolean;
  title: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 46,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
        {title}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" color={theme.colors.primary} size={22} />
      ) : null}
    </Pressable>
  );
}

export function ColorChoiceRow({
  color,
  onPress,
  selected,
  title,
}: {
  color: string;
  onPress: () => void;
  selected: boolean;
  title: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 50,
        paddingHorizontal: 16,
      })}
    >
      <View
        style={{
          backgroundColor: color,
          borderColor: "rgba(0, 0, 0, 0.08)",
          borderCurve: "continuous",
          borderRadius: 10,
          borderWidth: 1,
          height: 28,
          marginRight: 12,
          width: 28,
        }}
      />
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
        {title}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" color={theme.colors.primary} size={22} />
      ) : null}
    </Pressable>
  );
}

export function SettingsActionRow({
  destructive,
  onPress,
  title,
  value,
}: {
  destructive?: boolean;
  onPress: () => void;
  title: string;
  value: string;
}) {
  const theme = useTheme();
  const titleColor = destructive ? theme.colors.danger : theme.colors.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.surfaceSoft : theme.colors.surface,
        flexDirection: "row",
        minHeight: 46,
        paddingHorizontal: 16,
      })}
    >
      <Text style={{ color: titleColor, flex: 1, fontSize: 17 }}>{title}</Text>
      <Text style={{ color: theme.colors.muted, fontSize: 17, marginRight: 8 }}>
        {value}
      </Text>
      {value ? (
        <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />
      ) : null}
    </Pressable>
  );
}

export function SwitchRow({
  onValueChange,
  title,
  value,
}: {
  onValueChange: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        minHeight: 46,
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          flex: 1,
          fontSize: 17,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </View>
  );
}

export function InfoRow({ title, value }: { title: string; value: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        minHeight: 46,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17 }}>
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.muted,
          flex: 1.2,
          fontSize: 17,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function FooterText({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <Text
      style={{
        color: theme.colors.muted,
        fontSize: 13,
        lineHeight: 18,
        paddingHorizontal: 16,
      }}
    >
      {children}
    </Text>
  );
}
