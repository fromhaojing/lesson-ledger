# 课时记

本项目是一个 Expo Router 本地优先应用，用于记录课程、学生、课时金额、待确认课程和本地提醒。

## 架构

- `app/`: Expo Router 路由入口，页面实现委托给 `src/screens`。
- `src/screens/`: 主要页面和交互流程。
- `src/modules/lessons`: SQLite 课程读写、状态迁移和导入批次写入。
- `src/modules/imports`: Excel 解析和导入草稿缓存。
- `src/modules/notifications`: 本地通知调度和应用角标同步。
- `src/modules/statistics`: 按日期范围聚合统计数据。
- `src/modules/data`: 本地数据导出、清除和缓存清理。
- `src/db`: SQLite 连接和版本化迁移。
- `src/utils`: 日期、金额、数字等纯工具函数。

## 数据模型

本地 SQLite 数据库名为 `lesson-ledger.db`，核心表包括：

- `lesson`: 课程记录，状态包括 `scheduled`、`pending`、`confirmed`、`cancelled`、`absent`。
- `import_batch`: 每次 Excel 导入的文件名、行数和成功/失败统计。
- `app_setting`: 主题、默认金额、通知等设置。
- `schema_migrations`: 已执行迁移版本。

课程状态迁移集中在 repository 层保护，已确认、已取消或缺勤课程不会再次被确认、取消或标记缺勤。

## 导入与导出

- 导入支持 `.xlsx` 和 `.xls`，单个文件限制为 5MB。
- 导入预览草稿会缓存在本机 cache 中，导入完成或清除数据时会删除。
- 导入模板可通过 `npm run build:template` 生成到 `outputs/课时记-课程导入模板.xlsx`。
- 数据导出会生成 Excel 并调用系统分享；清除课程数据时会删除历史导出缓存。

## 常用命令

```bash
npm run typecheck
npm run lint
npm test
npm run build:template
npm run ios
```

## 隐私

当前版本不上传课程、学生、金额或设置数据。数据存储在本机 SQLite 中，导出的 Excel 包含个人课程信息，应按敏感文件处理。Android 自动备份已关闭，避免课程数据进入系统云备份。
