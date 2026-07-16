import {
  ChoiceRow,
  FooterText,
  SettingsDetail,
  SettingsGroup,
} from "@/components/settings-ui";
import { setSetting } from "@/modules/settings/settings.repository";
import { setThemeMode, useThemeMode, type ThemeMode } from "@/theme";

export function AppearanceSettingsScreen() {
  const themeMode = useThemeMode();

  async function changeThemeMode(mode: ThemeMode) {
    setThemeMode(mode);
    await setSetting("theme_mode", mode);
  }

  return (
    <SettingsDetail>
      <SettingsGroup title="显示">
        <ChoiceRow
          title="跟随系统"
          selected={themeMode === "unspecified"}
          onPress={() => changeThemeMode("unspecified")}
        />
        <ChoiceRow
          title="浅色"
          selected={themeMode === "light"}
          onPress={() => changeThemeMode("light")}
        />
        <ChoiceRow
          title="深色"
          selected={themeMode === "dark"}
          onPress={() => changeThemeMode("dark")}
        />
      </SettingsGroup>
      <FooterText>选择跟随系统后，课时记会使用 iOS 当前的外观设置。</FooterText>
    </SettingsDetail>
  );
}
