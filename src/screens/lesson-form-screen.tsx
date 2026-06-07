import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Host, Picker } from "@expo/ui";
import { useRouter } from "expo-router";

import { SafeAreaScrollView } from "@/components/safe-area-scroll-view";
import { Field, NumberWheelField, PrimaryButton, normalizeNumberWheelValue } from "@/components/ui";
import { lessonRepository } from "@/modules/lessons/lesson.repository";
import { syncPendingLessonBadge } from "@/modules/notifications/badge.service";
import { syncLessonNotifications } from "@/modules/notifications/notification.service";
import { getSetting } from "@/modules/settings/settings.repository";
import { combineDateTime, dateTextFromDate, timeTextFromDate, todayText } from "@/utils/date";
import { parseAmount } from "@/utils/money";
import { useTheme } from "@/theme";

export function LessonFormScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [initialSchedule] = useState(getInitialSchedule);
  const [dateText, setDateText] = useState(initialSchedule.dateText);
  const [startTime, setStartTime] = useState(initialSchedule.startTime);
  const [endTime, setEndTime] = useState(initialSchedule.endTime);
  const [students, setStudents] = useState("");
  const [grade, setGrade] = useState("");
  const [courseType, setCourseType] = useState("一对一");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const selectedDate = pickerDate(dateText, startTime);
  const selectedStart = pickerDate(dateText, startTime);
  const selectedEnd = pickerDate(dateText, endTime);

  useEffect(() => {
    getSetting("default_amount", "150").then(setAmount).catch(() => setAmount("150"));
  }, []);

  async function save() {
    try {
      const studentNames = students
        .split(/[\/、,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (studentNames.length === 0) throw new Error("请填写学生姓名");
      const fallbackAmount = await getSetting("default_amount", "150");

      await lessonRepository.create({
        title: studentNames.join("、"),
        studentNames,
        dateText,
        startAt: combineDateTime(dateText, startTime),
        endAt: combineDateTime(dateText, endTime),
        grade: grade || null,
        courseType: courseType || null,
        defaultAmount: parseAmount(normalizeNumberWheelValue(amount || fallbackAmount)),
        note: note || null
      });
      await syncLessonNotifications({ askPermission: true });
      await syncPendingLessonBadge();
      router.back();
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "请检查课程信息。");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaScrollView contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
        <PickerField
          label="日期"
          mode="date"
          value={selectedDate}
          onChange={(date) => setDateText(dateTextFromDate(date))}
        />
        <PickerField
          label="开始时间"
          mode="time"
          value={selectedStart}
          onChange={(date) => {
            setStartTime(timeTextFromDate(date));
            setEndTime(timeTextFromDate(oneHourLater(date)));
          }}
        />
        <PickerField
          label="结束时间"
          mode="time"
          value={selectedEnd}
          onChange={(date) => setEndTime(timeTextFromDate(date))}
        />
        <Field label="学生（合班可用 / 分隔）" value={students} onChangeText={setStudents} placeholder="张三/李四" />
        <SelectField label="年级" value={grade} placeholder="选择年级" options={gradeOptions} onChange={setGrade} />
        <Field label="课程类型" value={courseType} onChangeText={setCourseType} placeholder="一对一" />
        <NumberWheelField label="默认金额" value={amount} onChangeText={setAmount} suffix="元" placeholder="选择金额" />
        <Field label="备注" value={note} onChangeText={setNote} placeholder="可选" />
        <PrimaryButton onPress={save}>保存课程</PrimaryButton>
      </SafeAreaScrollView>
    </View>
  );
}

const gradeOptions = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "初一", "初二", "初三", "高一", "高二", "高三"].map(
  (grade) => ({ label: grade, value: grade })
);

type SelectOption = {
  label: string;
  value: string;
};

function SelectField({
  label,
  onChange,
  options,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const selectedValue = options.find((item) => item.label === value)?.value ?? options.find((item) => item.value === value)?.value ?? "";
  const selectedIndex = Math.max(
    0,
    options.findIndex((item) => item.value === selectedValue)
  );

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: "500" }}>{label}</Text>
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
          paddingHorizontal: 14
        })}
      >
        <Text style={{ color: value ? theme.colors.text : "#A1AAB8", flex: 1, fontSize: 16 }}>{value || placeholder}</Text>
        <Text style={{ color: theme.colors.muted, fontSize: 18 }}>⌄</Text>
      </Pressable>
      {visible ? (
        <SelectionSheet
          initialIndex={selectedIndex}
          onClose={() => setVisible(false)}
          onSelect={(nextValue) => {
            onChange(nextValue);
            setVisible(false);
          }}
          options={options}
          title={label}
        />
      ) : null}
    </View>
  );
}

function SelectionSheet({
  initialIndex,
  onClose,
  onSelect,
  options,
  title
}: {
  initialIndex: number;
  onClose: () => void;
  onSelect: (value: string) => void;
  options: SelectOption[];
  title: string;
}) {
  const theme = useTheme();
  const [draftValue, setDraftValue] = useState(options[initialIndex]?.value ?? options[0]?.value ?? "");

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={{ backgroundColor: "rgba(0, 0, 0, 0.24)", flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "62%",
            paddingBottom: 24,
            paddingTop: 8
          }}
        >
          <View style={{ alignItems: "center", paddingBottom: 8 }}>
            <View style={{ backgroundColor: theme.colors.line, borderRadius: 999, height: 4, width: 42 }} />
          </View>
          <View style={{ alignItems: "center", flexDirection: "row", minHeight: 44, paddingHorizontal: 18 }}>
            <Text style={{ color: theme.colors.text, flex: 1, fontSize: 17, fontWeight: "600" }}>{title}</Text>
            <Pressable onPress={() => onSelect(draftValue)} hitSlop={10}>
              <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: "600" }}>完成</Text>
            </Pressable>
          </View>
          <View style={{ height: 220, justifyContent: "center", paddingHorizontal: 18 }}>
            <Host colorScheme={theme.scheme} style={{ flex: 1 }}>
              <Picker appearance="wheel" selectedValue={draftValue} onValueChange={setDraftValue}>
                {options.map((item) => (
                  <Picker.Item key={item.value} label={item.label} value={item.value} />
                ))}
              </Picker>
            </Host>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PickerField({
  label,
  mode,
  onChange,
  value
}: {
  label: string;
  mode: "date" | "time";
  onChange: (date: Date) => void;
  value: Date;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.line,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        minHeight: 50,
        paddingLeft: 14,
        paddingRight: 8
      }}
    >
      <Text style={{ color: theme.colors.text, flex: 1, fontSize: 16, fontWeight: "500" }}>{label}</Text>
      <DateTimePicker
        display="compact"
        locale="zh-Hans"
        minuteInterval={5}
        mode={mode}
        onChange={(_, date) => {
          if (date) onChange(date);
        }}
        value={value}
      />
    </View>
  );
}

function pickerDate(dateText: string, timeText: string) {
  const date = new Date(`${dateText}T${timeText}:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getInitialSchedule() {
  const start = new Date();
  const end = oneHourLater(start);

  return {
    dateText: todayText(),
    startTime: timeTextFromDate(start),
    endTime: timeTextFromDate(end)
  };
}

function oneHourLater(date: Date) {
  return new Date(date.getTime() + 60 * 60 * 1000);
}
