import { Appearance, useColorScheme as useSystemColorScheme } from "react-native";
import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ThemeColorKey = "mint" | "blue" | "purple" | "orange" | "rose";

type ThemeColorPreset = {
  key: ThemeColorKey;
  label: string;
  light: {
    primary: string;
    primaryDark: string;
    surfaceSoft: string;
  };
  dark: {
    primary: string;
    primaryDark: string;
    surfaceSoft: string;
  };
};

export const themeColorPresets: ThemeColorPreset[] = [
  {
    key: "mint",
    label: "薄荷绿",
    light: { primary: "#14A38B", primaryDark: "#087766", surfaceSoft: "#EEF6F4" },
    dark: { primary: "#4AD6BF", primaryDark: "#82E8D8", surfaceSoft: "#15251F" }
  },
  {
    key: "blue",
    label: "湖蓝",
    light: { primary: "#2563EB", primaryDark: "#1D4ED8", surfaceSoft: "#EEF4FF" },
    dark: { primary: "#60A5FA", primaryDark: "#93C5FD", surfaceSoft: "#172236" }
  },
  {
    key: "purple",
    label: "紫罗兰",
    light: { primary: "#7C3AED", primaryDark: "#5B21B6", surfaceSoft: "#F3EEFF" },
    dark: { primary: "#A78BFA", primaryDark: "#C4B5FD", surfaceSoft: "#241B33" }
  },
  {
    key: "orange",
    label: "暖橙",
    light: { primary: "#EA7A1A", primaryDark: "#B45309", surfaceSoft: "#FFF3E6" },
    dark: { primary: "#FDBA74", primaryDark: "#FED7AA", surfaceSoft: "#2D2118" }
  },
  {
    key: "rose",
    label: "玫瑰",
    light: { primary: "#E11D48", primaryDark: "#BE123C", surfaceSoft: "#FFF1F3" },
    dark: { primary: "#FB7185", primaryDark: "#FDA4AF", surfaceSoft: "#301B23" }
  }
];

const lightColors = {
  background: "#F7FAFC",
  surface: "#FFFFFF",
  surfaceSoft: "#EEF6F4",
  primary: "#14A38B",
  primaryDark: "#087766",
  accent: "#FFB84D",
  text: "#14213D",
  muted: "#6D778C",
  line: "#E2E8F0",
  danger: "#E05263",
  success: "#2BAE66",
  warning: "#F39B22",
  purple: "#7C6FF6"
};

const darkColors = {
  background: "#101419",
  surface: "#171D24",
  surfaceSoft: "#15251F",
  primary: "#4AD6BF",
  primaryDark: "#82E8D8",
  accent: "#F6BF63",
  text: "#EEF3F8",
  muted: "#98A4B3",
  line: "#26313D",
  danger: "#FF7A8A",
  success: "#5ED18F",
  warning: "#F8B95B",
  purple: "#A9A0FF"
};

const radius = {
  sm: 10,
  md: 16,
  lg: 22
};

let currentMode: ThemeMode = "system";
let currentThemeColor: ThemeColorKey = "mint";
const listeners = new Set<() => void>();

function emitThemeChange() {
  listeners.forEach((listener) => listener());
}

export function normalizeThemeColor(value: string): ThemeColorKey {
  return themeColorPresets.some((preset) => preset.key === value) ? (value as ThemeColorKey) : "mint";
}

export function setThemeMode(mode: ThemeMode) {
  currentMode = mode;
  Appearance.setColorScheme((mode === "system" ? null : mode) as any);
  emitThemeChange();
}

export function getThemeMode() {
  return currentMode;
}

export function setThemeColor(color: ThemeColorKey) {
  currentThemeColor = color;
  emitThemeChange();
}

export function getThemeColor() {
  return currentThemeColor;
}

export function subscribeThemeMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemeMode() {
  return useSyncExternalStore(subscribeThemeMode, getThemeMode, getThemeMode);
}

export function useThemeColor() {
  return useSyncExternalStore(subscribeThemeMode, getThemeColor, getThemeColor);
}

export function useTheme() {
  const mode = useThemeMode();
  const themeColor = useThemeColor();
  const systemScheme = useSystemColorScheme();
  const resolvedScheme = mode === "system" ? systemScheme ?? "light" : mode;
  const baseColors = resolvedScheme === "dark" ? darkColors : lightColors;
  const preset = themeColorPresets.find((item) => item.key === themeColor) ?? themeColorPresets[0];

  return {
    mode,
    scheme: resolvedScheme,
    themeColor,
    colors: {
      ...baseColors,
      ...(resolvedScheme === "dark" ? preset.dark : preset.light)
    },
    radius
  };
}
