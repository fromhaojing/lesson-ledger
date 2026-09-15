import AppKit
import UniformTypeIdentifiers

@MainActor extension LedgerStore {
    var cloudRemindersEnabled: Bool { settings["cloud_notifications_enabled"] != "false" }
    func importCloudReminderConnection() {
        let panel = NSOpenPanel()
        panel.title = "导入课程通知连接配置"
        panel.allowedContentTypes = [.json]
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let connection = try JSONDecoder().decode(CloudReminderConnection.self, from: Data(contentsOf: url))
            try connection.save()
            setSetting("cloud_notifications_enabled", "true")
            requestCloudReminderSync()
        } catch { cloudReminderStatus = error.localizedDescription }
    }
    func requestCloudReminderSync() {
        guard !isPreview, database != nil, cloudDataLoaded else { return }
        // Coalesce launch, activation, and edits. Do not cancel in-flight POST requests.
        if cloudSyncTask != nil { cloudSyncRequested = true; return }
        cloudReminderSyncing = true
        cloudSyncTask = Task { [weak self] in
            guard let self else { return }
            repeat {
                cloudSyncRequested = false
                do {
                    try reload()
                    guard let token = try CloudReminderKeychain.read() else {
                        cloudReminderStatus = "未配置，请导入连接配置。"
                        break
                    }
                    cloudReminderStatus = "正在检查云端待提醒课程…"
                    let candidates = lessons.filter { $0.status.isOpen }.map(CloudReminderRequest.from)
                    let api = CloudReminderHTTPClient(token: token)
                    let result = try await CloudReminderSync.run(api: api, candidates: candidates, enabled: cloudRemindersEnabled)
                    cloudReminderCount = result.waiting
                    cloudReminderStatus = cloudRemindersEnabled
                        ? "已安排 \(result.waiting)/30 节，本次补充 \(result.added) 节。"
                        : "iPhone 提醒已关闭，云端待提醒任务已清理。"
                } catch { cloudReminderStatus = error.localizedDescription }
            } while cloudSyncRequested
            cloudReminderSyncing = false
            cloudSyncTask = nil
        }
    }
}
