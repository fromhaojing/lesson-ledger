import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/lishuo/Documents/lishuo/expo/lesson-ledger/outputs";
const outputPath = `${outputDir}/课时记-课程导入模板.xlsx`;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("课程导入模板");
const helpSheet = workbook.worksheets.add("填写说明");

sheet.getRange("A1:H1").values = [[
  "日期",
  "开始时间",
  "结束时间",
  "学生",
  "年级",
  "课程类型",
  "默认金额",
  "备注"
]];

sheet.getRange("A2:H6").values = [
  ["2026-06-01", "18:00", "19:30", "张小明", "三年级", "一对一", 150, "数学复习"],
  ["2026-06-02", "17:30", "19:00", "李可/王一", "四年级", "小班课", 120, "多人学生可用 / 、，分隔"],
  ["2026-06-03", "19:00", "20:30", "陈安安", "初一", "英语", 180, ""],
  ["2026-06-05", "16:00", "17:00", "赵乐乐", "五年级", "试听课", 0, "试听可填 0"],
  ["2026-06-06", "09:30", "11:00", "孙同学，周同学", "初二", "周末班", 160, "也支持中文逗号分隔"]
];

helpSheet.getRange("A1:B1").values = [["字段", "说明"]];
helpSheet.getRange("A2:B6").values = [
  ["日期", "必填，推荐格式 2026-06-01"],
  ["开始时间 / 结束时间", "必填，推荐格式 18:00"],
  ["学生", "必填；多个学生可用 /、顿号、英文逗号或中文逗号分隔"],
  ["默认金额", "可填数字；试听或免费课程可填 0"],
  ["备注", "可留空"]
];

sheet.getRange("A1:H1").format.fill = { color: "#14A38B" };
sheet.getRange("A1:H1").format.font = { color: "#FFFFFF", bold: true };
sheet.getRange("A1:H6").format.font = { name: "PingFang SC", size: 11 };
sheet.getRange("A1:H6").format.alignment = { vertical: "middle", wrapText: true };
helpSheet.getRange("A1:B1").format.fill = { color: "#EEF6F4" };
helpSheet.getRange("A1:B1").format.font = { bold: true, color: "#087766" };
helpSheet.getRange("A1:B6").format.font = { name: "PingFang SC", size: 11 };
helpSheet.getRange("A1:B6").format.alignment = { vertical: "middle", wrapText: true };

sheet.getRange("A1:H6").format.borders = {
  all: { style: "thin", color: "#D7DEE8" }
};
helpSheet.getRange("A1:B6").format.borders = {
  all: { style: "thin", color: "#D7DEE8" }
};

sheet.getRange("A:A").format.columnWidth = 15;
sheet.getRange("B:C").format.columnWidth = 12;
sheet.getRange("D:D").format.columnWidth = 18;
sheet.getRange("E:F").format.columnWidth = 14;
sheet.getRange("G:G").format.columnWidth = 12;
sheet.getRange("H:H").format.columnWidth = 32;
helpSheet.getRange("A:A").format.columnWidth = 18;
helpSheet.getRange("B:B").format.columnWidth = 54;

sheet.getRange("A1:H1").format.rowHeight = 24;
sheet.getRange("A2:H6").format.rowHeight = 24;
await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(outputPath);
