import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { clearImportDraft, getImportDraft, loadImportDraft, type ImportDraft } from "@/modules/imports/import-draft.store";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import type { CreateLessonInput } from "@/modules/lessons/lesson.types";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { useTheme } from "@/theme";
import { combineLessonDateTimeRange, parseDateText, parseTimeText } from "@/utils/date";
import { parseAmount } from "@/utils/money";
import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Card, Field, NumberWheelField, PrimaryButton, normalizeNumberWheelValue } from "@/components/ui";

type EditableImportRow = {
  dateText: string;
  startTime: string;
  endTime: string;
  students: string;
  grade: string;
  courseType: string;
  amount: string;
  note: string;
};

export function ImportPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const initialDraft = getImportDraft();
  const [draft, setDraft] = useState<ImportDraft | null>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!initialDraft);
  const [rows, setRows] = useState<EditableImportRow[]>(() => initialDraft?.preview.successRows.map(toEditableRow) ?? []);
  const failedRows = draft?.preview.failedRows ?? [];
  const filename = draft?.filename ?? "";
  const totalRows = draft?.preview.totalRows ?? 0;

  useEffect(() => {
    if (draft) return;

    let mounted = true;
    loadImportDraft()
      .then((nextDraft) => {
        if (!mounted) return;
        setDraft(nextDraft);
        setRows(nextDraft?.preview.successRows.map(toEditableRow) ?? []);
      })
      .catch((error) => {
        if (mounted) {
          Alert.alert("读取导入草稿失败", error instanceof Error ? error.message : "请重新选择 Excel 文件。");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [draft]);

  const canImport = rows.length > 0 && !busy;
  const summaryText = useMemo(
    () => `共 ${totalRows} 行，${rows.length} 行可导入${failedRows.length > 0 ? `，${failedRows.length} 行解析失败` : ""}`,
    [failedRows.length, rows.length, totalRows]
  );

  function updateRow(index: number, patch: Partial<EditableImportRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function confirmImport() {
    if (!draft) return;

    setBusy(true);
    try {
      const inputs = rows.map(toCreateLessonInput);
      await lessonRepository.createImportBatch({
        failedRows: failedRows.length,
        filename: draft.filename,
        lessons: inputs,
        sourceUri: draft.sourceUri,
        totalRows
      });
      await syncLessonNotifications({ askPermission: true });
      await syncPendingLessonBadge();
      await clearImportDraft();
      Alert.alert("导入完成", `成功导入 ${inputs.length} 节课程。`);
      router.dismissAll();
    } catch (error) {
      Alert.alert("导入失败", error instanceof Error ? error.message : "请检查预览里的课程信息。");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={{ alignItems: "center", backgroundColor: theme.colors.background, flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SafeAreaScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
          <Card>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "600" }}>没有待导入的课表</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 22 }}>请先选择 Excel 文件并完成解析。</Text>
            <PrimaryButton onPress={() => router.back()} variant="glass">返回选择文件</PrimaryButton>
          </Card>
        </SafeAreaScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        contentContainerStyle={{ gap: 12, paddingBottom: 120, paddingHorizontal: 20 }}
        data={rows}
        keyExtractor={(_, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Card>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: "600" }}>
                    {filename}
                  </Text>
                  <Text selectable style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 22 }}>
                    {summaryText}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
                  <PrimaryButton disabled={!canImport} onPress={confirmImport} variant="glass">
                    {busy ? "导入中..." : "确认导入"}
                  </PrimaryButton>
                </View>
              </View>
            </Card>

            {failedRows.length > 0 ? (
              <Card>
                <Text style={{ color: theme.colors.danger, fontSize: 16, fontWeight: "600" }}>解析失败</Text>
                {failedRows.slice(0, 6).map((row) => (
                  <Text key={row.rowIndex} selectable style={{ color: theme.colors.danger, fontSize: 13, lineHeight: 18 }}>
                    第 {row.rowIndex} 行：{row.reason}
                  </Text>
                ))}
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item: row, index }) => (
          <Card>
            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: "600" }}>课程 {index + 1}</Text>
            <Field label="日期" value={row.dateText} onChangeText={(value) => updateRow(index, { dateText: value })} placeholder="2026-05-31" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="开始" value={row.startTime} onChangeText={(value) => updateRow(index, { startTime: value })} placeholder="18:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="结束" value={row.endTime} onChangeText={(value) => updateRow(index, { endTime: value })} placeholder="19:00" />
              </View>
            </View>
            <Field label="学生" value={row.students} onChangeText={(value) => updateRow(index, { students: value })} placeholder="张三/李四" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="年级" value={row.grade} onChangeText={(value) => updateRow(index, { grade: value })} placeholder="高一" />
              </View>
              <View style={{ flex: 1 }}>
                <NumberWheelField
                  label="金额"
                  value={row.amount}
                  onChangeText={(value) => updateRow(index, { amount: value })}
                  placeholder="150"
                  suffix="元"
                />
              </View>
            </View>
            <Field label="课程类型" value={row.courseType} onChangeText={(value) => updateRow(index, { courseType: value })} placeholder="一对一" />
            <Field label="备注" value={row.note} onChangeText={(value) => updateRow(index, { note: value })} placeholder="可选" />
          </Card>
        )}
      />
    </View>
  );
}

function toEditableRow(input: CreateLessonInput): EditableImportRow {
  return {
    dateText: input.dateText,
    startTime: formatTime(input.startAt),
    endTime: formatTime(input.endAt),
    students: input.studentNames.join("/"),
    grade: input.grade ?? "",
    courseType: input.courseType ?? "",
    amount: String(input.defaultAmount ?? 0),
    note: input.note ?? ""
  };
}

function toCreateLessonInput(row: EditableImportRow): CreateLessonInput {
  const dateText = parseDateText(row.dateText);
  const startTime = parseTimeText(row.startTime);
  const endTime = parseTimeText(row.endTime);
  const { startAt, endAt } = combineLessonDateTimeRange(dateText, startTime, endTime);
  const studentNames = row.students
    .split(/[\/、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (studentNames.length === 0) throw new Error("请填写学生姓名");

  return {
    title: studentNames.join("、"),
    studentNames,
    dateText,
    startAt,
    endAt,
    grade: row.grade.trim() || null,
    courseType: row.courseType.trim() || null,
    defaultAmount: parseAmount(normalizeNumberWheelValue(row.amount)),
    note: row.note.trim() || null
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
