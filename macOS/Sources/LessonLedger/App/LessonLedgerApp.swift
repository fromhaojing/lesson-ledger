import SwiftUI
import AppKit
import UserNotifications

@main struct LessonLedgerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var store = LedgerStore()
    var body: some Scene {
        Window("钱来", id: "main") {
            MainView().environmentObject(store)
                .toolbarBackground(.hidden, for: .windowToolbar)
                .tint(store.accent).accentColor(store.accent).preferredColorScheme(store.scheme)
                .environment(\.locale, Locale(identifier: "zh_CN"))
                .onAppear { delegate.store = store; store.scheduleNotifications(); store.requestCloudReminderSync() }
        }
        .defaultSize(width: 1240, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("新建课程") { NotificationCenter.default.post(name: .newLesson, object: nil) }
                    .keyboardShortcut("n", modifiers: .command)
                Divider()
                Button("导入 Excel…") { store.chooseImport() }.keyboardShortcut("i", modifiers: [.command, .shift])
                Button("导出 Excel…") { store.exportExcel() }.keyboardShortcut("e", modifiers: [.command, .shift])
                Button("保存导入模板…") { store.exportExcel(template: true) }
                Divider()
                Button("备份数据库…") { store.backup() }
            }
            CommandGroup(replacing: .help) {
                Button("关于钱来") { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "钱来", .applicationVersion: "2.0.0", .credits: NSAttributedString(string: "macOS 原生课程账本\n课程账本，支持可选的云端课程结束提醒。")]) }
            }
        }
        Settings {
            SettingsView().environmentObject(store).tint(store.accent).accentColor(store.accent).preferredColorScheme(store.scheme)
                .toolbarBackground(.hidden, for: .windowToolbar)
                .environment(\.locale, Locale(identifier: "zh_CN"))
        }
    }
}

extension Notification.Name { static let newLesson = Notification.Name("LessonLedger.newLesson") }

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var store: LedgerStore?
    func applicationDidFinishLaunching(_ notification: Notification) {
        CalendarDateCache.shared.start()
        NSApp.setActivationPolicy(.regular)
        UNUserNotificationCenter.current().delegate = self
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationDidBecomeActive(_ notification: Notification) {
        Task { @MainActor in store?.requestCloudReminderSync() }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        Task { @MainActor in store?.requestCloudReminderSync() }
        if !flag { sender.windows.first(where: { $0.identifier?.rawValue == "main" })?.makeKeyAndOrderFront(nil) }
        return true
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let id = response.notification.request.content.userInfo["lessonId"] as? String
        await MainActor.run {
            store?.requestedLessonID = id
            NSApp.activate(ignoringOtherApps: true)
            NSApp.windows.first(where: { $0.canBecomeMain })?.makeKeyAndOrderFront(nil)
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
