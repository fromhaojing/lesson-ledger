import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";

import {
  FooterText,
  InfoRow,
  SettingsActionRow,
  SettingsDetail,
  SettingsGroup,
} from "@/components/settings-ui";
import {
  clearAllUserData,
  exportDataToExcel,
  getLocalDataSize,
} from "@/modules/data/data-management.service";
import { formatBytes } from "@/screens/settings/settings-helpers";

export function PrivacySettingsScreen() {
  const [storageSize, setStorageSize] = useState("计算中");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStorageSize(formatBytes(await getLocalDataSize()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function exportData() {
    setBusy(true);
    try {
      await exportDataToExcel();
    } catch (error) {
      Alert.alert(
        "导出失败",
        error instanceof Error ? error.message : "请稍后再试。",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmClearData() {
    Alert.alert(
      "清除课程数据？",
      "这会删除本机保存的课程和导入记录，保留外观、通知和课程默认值。建议先导出备份。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "继续",
          style: "destructive",
          onPress: confirmClearDataAgain,
        },
      ],
    );
  }

  function confirmClearDataAgain() {
    Alert.alert(
      "再次确认清除",
      "清除后无法恢复。确定要删除课时记在本机保存的课程和导入记录吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "清除课程数据",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await clearAllUserData();
              await load();
              Alert.alert(
                "已清除",
                "课程和导入记录已经清除，外观、通知和课程默认值已保留。",
              );
            } catch (error) {
              Alert.alert(
                "清除失败",
                error instanceof Error ? error.message : "请稍后再试。",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SettingsDetail>
      <SettingsGroup title="数据">
        <InfoRow title="存储位置" value="仅保存在这台设备" />
        <InfoRow title="本地数据占用" value={storageSize} />
      </SettingsGroup>
      <SettingsGroup title="管理">
        <SettingsActionRow
          title="导出数据"
          value={busy ? "处理中" : "Excel"}
          onPress={exportData}
        />
        <SettingsActionRow
          title="清除课程数据"
          value=""
          destructive
          onPress={confirmClearData}
        />
      </SettingsGroup>
      <FooterText>
        当前版本使用本地 SQLite
        数据库存放课程、金额、设置和导入记录。清除课程数据会保留设置；删除 App
        会同时删除这些本地数据。
      </FooterText>
    </SettingsDetail>
  );
}
