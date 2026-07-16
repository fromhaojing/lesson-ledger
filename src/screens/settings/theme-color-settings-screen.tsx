import {
  ColorChoiceRow,
  FooterText,
  SettingsDetail,
  SettingsGroup,
} from "@/components/settings-ui";
import { setSetting } from "@/modules/settings/settings.repository";
import {
  setThemeColor,
  themeColorPresets,
  useThemeColor,
  type ThemeColorKey,
} from "@/theme";

export function ThemeColorSettingsScreen() {
  const themeColor = useThemeColor();

  async function changeThemeColor(color: ThemeColorKey) {
    setThemeColor(color);
    await setSetting("theme_color", color);
  }

  return (
    <SettingsDetail>
      <SettingsGroup title="主题色">
        {themeColorPresets.map((preset) => (
          <ColorChoiceRow
            key={preset.key}
            color={preset.light.primary}
            onPress={() => changeThemeColor(preset.key)}
            selected={themeColor === preset.key}
            title={preset.label}
          />
        ))}
      </SettingsGroup>
      <FooterText>
        主题色会用于底部标签、按钮、日历选中态和页面强调色，并保存在本机。
      </FooterText>
    </SettingsDetail>
  );
}
