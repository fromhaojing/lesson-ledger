# 钱来 · macOS

使用 SwiftUI、AppKit 和 Apple Charts 构建的本地课程账本，支持 macOS 14 及以上版本。当前分支已移除 Expo / React Native 与 iOS、Android 工程。

## 运行

需要安装 Xcode（包含 macOS SDK）和 Python 3。不需要 Node.js、npm、CocoaPods 或额外的 Swift 包。

```bash
# 退出旧进程、编译 release 版并重新打开应用
./macOS/scripts/compile_and_run.sh

# 只生成 release 应用
./macOS/scripts/build-app.sh release

# 编译并运行 release 版
./macOS/scripts/compile_and_run.sh release

# 提取指定版本的发布说明
./macOS/scripts/release-notes.sh 2.0.0

# 运行自动测试
./macOS/scripts/test.sh
```

生成的应用位于 `macOS/build/钱来.app`，可以直接打开或拖入「应用程序」。构建默认使用 `release` 和当前 Mac 的 CPU 架构，并执行本机临时签名及签名校验；对外分发需另行使用 Developer ID 签名和公证。

`build-app.sh` 支持 `MARKETING_VERSION`（默认取 `Info.plist`）、`BUILD_NUMBER`（默认取 Git 提交数量）和 `ARCHES` 环境变量。版本覆盖只写入生成的应用，不修改源 `Info.plist`。例如构建 Apple Silicon / Intel 通用版本：

```bash
ARCHES="arm64 x86_64" MARKETING_VERSION=2.0.0 BUILD_NUMBER=10 ./macOS/scripts/build-app.sh release
```

`run.sh` 保留为 `compile_and_run.sh` 的兼容入口；两者均支持 `[debug|release] [--preview]`，默认 `release`；需要断点调试时显式传入 `debug`。一键运行会先退出正在运行的钱来，若无法退出则报错停止。版本说明维护在仓库根目录的 `CHANGELOG.md` 中。

在 Xcode 中打开 `macOS/Package.swift` 可以编辑、编译和运行测试。体验完整菜单、图标与系统通知请使用脚本生成的 `.app`。

需要查看带有模拟课程的界面时，运行：

```bash
./macOS/scripts/compile_and_run.sh release --preview
```

演示模式使用独立临时数据库，不读取正式课程，也不安排系统通知。

## 功能

- 今天：当天课程、预计收入、已确认金额。
- 课程日历：日 / 周 / 月 / 年分段切换；日、周视图展示 24 小时时间轴，重叠课程并排排列，可双击时间格新建、拖动课程调整日期和开始时间（15 分钟对齐，保留原时长）。月视图保留长方形连续周网格和虚拟滚动，每天最多展示 3 节，超出用 `+N` 展开。年视图按年份连续向上、向下滚动并懒加载，各年展示月份网格，顶部年份和统计随滚动更新；点击月份进入月视图、点击日期进入日视图，有课程的日期显示圆点。各视图共用搜索、详情、编辑、确认、取消与删除；前后切换和回到今天按当前视图定位，已确认或已取消课程不可改期。
- 全部课程：搜索学生与课程、状态筛选、详情、编辑、取消与删除。
- 待确认：自动识别已结束课程、实际金额确认、按默认金额批量确认。
- 统计：日期范围、确认收入趋势、学生课次排行和明细。
- Excel：`.xlsx` / `.xls` 导入预览、逐行错误提示、导出和空白模板。
- 设置：默认金额、系统/浅色/深色外观、六种主题色（薄荷绿、湖蓝、紫罗兰、暖橙、玫瑰、珊瑚红）、课程结束前后提醒。主题色沿用原版的深浅色配色，并保存到本机；首版 Mac 的粉色选项自动对应玫瑰。
- Mac 操作：原生侧栏、表格、表单、设置窗口、文件对话框、菜单和快捷键。

`⌘N` 新建课程，`⇧⌘I` 导入，`⇧⌘E` 导出，`⌘,` 打开设置。右键课程可编辑、确认、取消或删除；待确认表格支持 Command / Shift 多选。

日历中，鼠标悬停或点击课程后可用 `⌘C` 复制，也可右键选择「复制课程」。将鼠标移到目标位置后按 `⌘V`，或右键选择「粘贴课程」：日、周视图按指向时间粘贴，月、年视图按指向日期并保留原上课时间。每次粘贴都会新建独立课程，保留名称、学生、时长、默认金额与备注；状态按新日期变为未开始或待确认，不复制已确认收入或取消状态。输入框内的复制、粘贴仍按普通文本处理。

复制成功后会显示短暂提示。剪贴板中有课程时，鼠标移动到日历上会显示粘贴预览：月、年视图高亮日期，日、周视图高亮实际粘贴位置、时长及重叠后的并排宽度。鼠标离开或剪贴板换成其他内容后，预览会清除。

按 `⌘Z` 或右键选择「撤销粘贴课程」，可以移除最近一次粘贴生成的课程，原课程不受影响；连续粘贴可逐次撤销。撤销记录保留在本次运行期间，只针对粘贴操作，输入框中的 `⌘Z` 仍撤销文本编辑。

## 本地数据与迁移

正式数据库位于：

```text
~/Library/Application Support/LessonLedger/lesson-ledger.db
```

沿用原应用的 `lesson`、`import_batch`、`app_setting`、`schema_migrations` 表结构。金额确认与取消在数据库层保护；已确认或已取消的课程不能再次确认、取消或编辑。删除使用 `deleted_at` 软删除。

从手机端迁移课程：先在原应用导出 Excel，再在 Mac 的「文件 → 导入 Excel」中预览并导入。原导出文件中的状态、实际金额和备注会保留。导入是追加操作，不自动去重；Excel 的「设置」工作表仅供参考，不自动覆盖本机设置。

完整备份使用「文件 → 备份数据库」，通过 SQLite backup API 正确包含 WAL 中的数据。手动恢复时，先退出应用，保留当前数据库及其 `-wal` / `-shm` 文件的副本并移出数据目录，再将完整备份放入该目录、命名为 `lesson-ledger.db` 后启动。不要在应用运行中直接替换数据库文件。

本地提醒需在设置中申请 macOS 通知权限；每次打开应用时更新未来 14 天内最多 50 条本地提醒。

可选的 iPhone 云端提醒使用 `https://notify.hjverse.com`。在「设置 → 提醒 → iPhone 云端提醒」导入连接配置，访问令牌保存到系统钥匙串。每次启动、重新激活 App 或修改课程后，会先读取云端队列：已有 30 节且记录有效时不重复登记，不足时按课程结束时间从近到远补充，最多 30 节；改期、删除、取消或确认会清理旧提醒。只登记尚未结束的课程，不会补发过去的课。已登记的提醒在 Mac 合盖后仍可执行；长期不打开 App 则不会继续补充第 31 节以后的课。

云端只接收课程编号、结束时间和通用提醒文字，不接收学生姓名、金额、年级或备注。关闭云端提醒、取消或改期需联网同步成功后生效。连接失败或登记结果未确认时停止本次补充，下一次同步先核对云端，避免重复。

## 项目结构

```text
macOS/
  Package.swift             Swift Package 入口
  Info.plist                macOS 应用标识与版本
  AppIcon.png               应用图标源文件
  Sources/CSQLite/           系统 SQLite 模块
  Sources/LessonLedger/
    App/                    应用入口、主窗口与导航
    Models/                 课程模型、状态与日期基础类型
    Data/                   SQLite、账本状态、通知与 Excel 文件读写
    Features/
      Calendar/             日历视图、日期缓存、拖动与复制粘贴
      Lessons/              课程详情、编辑、确认与导入预览
      Statistics/           收入趋势与学生课次统计
      Settings/             应用设置
    Shared/
      Components/           通用日期选择器
      Theme/                主题与配色
    Resources/              数据库结构、SheetJS 与第三方许可证
  Tests/LessonLedgerTests/   状态迁移、事务、备份与 Excel 测试
  scripts/                  测试、构建与运行脚本
outputs/                    原有 Excel 导入模板
```

Excel 文件格式继续使用 SheetJS 0.18.5，通过系统 JavaScriptCore 在本机解析，无 WebView 或 JavaScript UI 运行时。完整第三方许可证位于 `macOS/Sources/LessonLedger/Resources/SheetJS-LICENSE.txt`。

### 日期缓存

日、周、月、年共用本地日期元数据缓存（日期排列、星期、农历），不包含课程数据、今天标记或选中状态。应用启动后在后台优先读取/生成当前月，再准备当前年及前后各两年；浏览范围外时按需补算并保存，接近边界时提前准备相邻月份/年份。首次没有缓存时先显示基础日期格，农历准备完成后再填入。

缓存保存在 `~/Library/Caches/LessonLedger/CalendarDates-v1/`，按月份写入独立文件，并用历法、时区、界面语言、周起始规则和算法/系统版本隔离。读取、计算、原子写入和清理均在后台完成，损坏文件会重新生成。磁盘最多保留 240 个月份文件；缓存可删除后重建，不影响课程账本。
