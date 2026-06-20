import { Platform } from "react-native";

export type NativeButtonStyle =
  | "automatic"
  | "bordered"
  | "borderedProminent"
  | "borderless"
  | "glass"
  | "glassProminent"
  | "plain";

export function isIosVersionAtLeast(version: number) {
  if (Platform.OS !== "ios") return false;

  const platformVersion = Platform.Version;
  const majorVersion =
    typeof platformVersion === "string"
      ? Number.parseInt(platformVersion, 10)
      : Math.floor(platformVersion);

  return Number.isFinite(majorVersion) && majorVersion >= version;
}

export function isLiquidGlassAvailable() {
  return isIosVersionAtLeast(26);
}

export function resolveGlassButtonStyle(
  fallback: Exclude<NativeButtonStyle, "glass" | "glassProminent"> = "bordered",
) {
  return isLiquidGlassAvailable() ? "glass" : fallback;
}
