import SwiftUI

struct CloudReminderSettingsSection: View {
    @EnvironmentObject private var store: LedgerStore
    var body: some View {
        Section("iPhone 云端提醒") {
            Toggle("启用 iPhone 提醒", isOn: Binding(
                get: { store.cloudRemindersEnabled },
                set: { store.setSetting("cloud_notifications_enabled", String($0)) }
            ))
            Button("导入连接配置…") { store.importCloudReminderConnection() }
            HStack {
                if store.cloudReminderSyncing { ProgressView().controlSize(.small) }
                Text(store.cloudReminderStatus).font(.caption).foregroundStyle(.secondary)
            }
            Button("立即检查并补充") { store.requestCloudReminderSync() }
                .disabled(store.cloudReminderSyncing)
            Text("每次打开或回到 App 时检查，云端最多等待 30 节。满 30 节且课程未变时不重复登记；不足时按结束时间补充。Mac 合盖后，已登记的课程仍由云端提醒。")
                .font(.caption).foregroundStyle(.secondary)
            Text("改期、取消及关闭提醒需要联网同步后才能影响云端。")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}
