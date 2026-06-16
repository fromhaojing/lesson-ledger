import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "..");
const outputPath = path.join(outputDir, "课时记-课程导入模板.xlsx");

const workbook = XLSX.utils.book_new();

const templateRows = [
  ["日期", "开始时间", "结束时间", "学生", "年级", "课程类型", "默认金额", "备注"],
  ["2026-06-01", "18:00", "19:30", "张小明", "三年级", "一对一", 150, "数学复习"],
  ["2026-06-02", "17:30", "19:00", "李可/王一", "四年级", "小班课", 120, "多人学生可用 / 、，分隔"],
  ["2026-06-03", "19:00", "20:30", "陈安安", "初一", "英语", 180, ""],
  ["2026-06-05", "16:00", "17:00", "赵乐乐", "五年级", "试听课", 0, "试听可填 0"],
  ["2026-06-06", "09:30", "11:00", "孙同学，周同学", "初二", "周末班", 160, "也支持中文逗号分隔"]
];

const helpRows = [
  ["字段", "说明"],
  ["日期", "必填，推荐格式 2026-06-01"],
  ["开始时间 / 结束时间", "必填，推荐格式 18:00"],
  ["学生", "必填；多个学生可用 /、顿号、英文逗号或中文逗号分隔"],
  ["默认金额", "可填数字；试听或免费课程可填 0"],
  ["备注", "可留空"]
];

const templateSheet = XLSX.utils.aoa_to_sheet(templateRows);
templateSheet["!cols"] = [
  { wch: 15 },
  { wch: 12 },
  { wch: 12 },
  { wch: 18 },
  { wch: 14 },
  { wch: 14 },
  { wch: 12 },
  { wch: 32 }
];

const helpSheet = XLSX.utils.aoa_to_sheet(helpRows);
helpSheet["!cols"] = [{ wch: 18 }, { wch: 54 }];

XLSX.utils.book_append_sheet(workbook, templateSheet, "课程导入模板");
XLSX.utils.book_append_sheet(workbook, helpSheet, "填写说明");

await fs.mkdir(outputDir, { recursive: true });
XLSX.writeFile(workbook, outputPath);

console.log(outputPath);
