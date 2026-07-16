import {
  FooterText,
  InfoRow,
  SettingsDetail,
  SettingsGroup,
} from "@/components/settings-ui";
import { APP_VERSION } from "@/screens/settings/settings-helpers";

export function AboutSettingsScreen() {
  return (
    <SettingsDetail>
      <SettingsGroup title="应用">
        <InfoRow title="名称" value="课时记" />
        <InfoRow title="版本" value={APP_VERSION} />
      </SettingsGroup>
      <FooterText>
        课时记用于在本机记录课程、学生、课时金额和提醒设置，帮助你快速查看待确认课程与收入统计。
      </FooterText>
    </SettingsDetail>
  );
}
