import { useState } from "react";
import { Alert, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Card, PrimaryButton } from "@/components/ui";
import { parseExcelFile } from "@/modules/imports/excel-parser";
import { setImportDraft } from "@/modules/imports/import-draft.store";
import { useTheme } from "@/theme";

export function ImportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  async function pickFile() {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel"
        ],
        copyToCacheDirectory: true
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        throw new Error("Excel 文件不能超过 5MB");
      }

      const preview = await parseExcelFile(asset.uri);
      await setImportDraft({ filename: asset.name, sourceUri: asset.uri, preview });
      router.push("/import/preview");
    } catch (error) {
      Alert.alert("解析失败", error instanceof Error ? error.message : "请确认文件为 Excel 格式。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        <Card tone="mint">
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "600" }}>标准字段</Text>
          <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 22 }}>
            日期、开始时间、结束时间、学生、年级、课程类型、默认金额、备注
          </Text>
          <PrimaryButton disabled={busy} onPress={pickFile}>{busy ? "处理中..." : "选择 Excel 文件"}</PrimaryButton>
        </Card>
      </SafeAreaScrollView>
    </View>
  );
}
