import SwiftUI
import AppKit

struct SettingsView: View {
    @EnvironmentObject private var store: LedgerStore
    @State private var defaultAmount = "150"
    @State private var validation: String?
    var body: some View {
        TabView {
            Form {
                Section("新课程") {
                    TextField("默认金额（元）", text: $defaultAmount)
                    HStack {
                        Spacer()
                        Button("保存默认金额") {
                            do { store.setSetting("default_amount", String(try parseAmount(defaultAmount))); validation = "已保存" }
                            catch { validation = error.localizedDescription }
                        }
                    }
                    if let validation { Text(validation).font(.caption).foregroundStyle(.secondary) }
                }
                Section("外观") {
                    Picker("显示模式", selection: store.setting("theme_mode", fallback: "unspecified")) {
                        Text("跟随系统").tag("unspecified"); Text("浅色").tag("light"); Text("深色").tag("dark")
                    }
                    Picker("主题色", selection: store.setting("theme_color", fallback: ThemeColor.defaultColor.rawValue)) {
                        ForEach(ThemeColor.allCases) { theme in
                            Text(theme.title).tag(theme.rawValue)
                        }
                    }
                    HStack(spacing: 10) {
                        ForEach(ThemeColor.allCases) { theme in
                            Button {
                                store.setSetting("theme_color", theme.rawValue)
                            } label: {
                                Circle().fill(theme.primary).frame(width: 28, height: 28)
                                    .overlay {
                                        if store.theme == theme {
                                            Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white)
                                                .shadow(color: .black.opacity(0.5), radius: 1)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .help(theme.title)
                            .accessibilityLabel(theme.title)
                            .accessibilityAddTraits(store.theme == theme ? [.isSelected] : [])
                        }
                    }
                    Text("主题色用于按钮、日历选中态、图表和页面强调色。")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped).tabItem { Label("通用", systemImage: "gearshape") }
            Form {
                Section("课程结束提醒") {
                    Toggle("启用本地提醒", isOn: Binding(get: { store.settings["notifications_enabled"] != "false" }, set: {
                        store.setSetting("notifications_enabled", String($0))
                        if $0 { store.scheduleNotifications(askPermission: true) }
                    }))
                    Picker("提醒时间", selection: store.setting("remind_timing", fallback: "before")) {
                        Text("课程结束前").tag("before"); Text("课程结束后").tag("after")
                    }
                    Picker("提醒间隔", selection: store.setting("remind_before_minutes", fallback: "5")) {
                        ForEach(0...30, id: \.self) { Text("\($0) 分钟").tag(String($0)) }
                    }
                }
                CloudReminderSettingsSection()
                Section("系统权限") {
                    LabeledContent("通知权限", value: store.notificationStatus)
                    Button("请求通知权限") { store.scheduleNotifications(askPermission: true) }
                    Button("打开系统通知设置") {
                        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!)
                    }
                    Text("每次打开应用时更新未来 14 天内最多 50 节课程的提醒。已安排的提醒由 macOS 发送，关闭应用后仍有效。")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped).tabItem { Label("提醒", systemImage: "bell") }
            Form {
                Section("课程数据") {
                    LabeledContent("课程数量", value: "\(store.lessons.count) 节")
                    Button("导出 Excel…") { store.exportExcel() }
                    Button("备份 SQLite 数据库…") { store.backup() }
                    Button("在 Finder 中查看数据") {
                        if let url = store.database?.url { NSWorkspace.shared.activateFileViewerSelecting([url]) }
                    }
                }
                Section("关于钱来") {
                    LabeledContent("版本", value: "2.0.0 · macOS 原生版")
                    Text("Excel 文件包含个人课程信息。导入会追加课程；完整数据库备份同时保存课程、导入批次与设置。")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.formStyle(.grouped).tabItem { Label("数据与隐私", systemImage: "internaldrive") }
        }.frame(width: 520, height: 460)
            .onAppear { defaultAmount = store.settings["default_amount"] ?? "150"; store.scheduleNotifications() }
    }
}
