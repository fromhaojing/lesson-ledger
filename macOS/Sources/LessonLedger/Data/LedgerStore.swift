import AppKit
import SwiftUI
import UserNotifications
import UniformTypeIdentifiers

@MainActor final class LedgerStore: ObservableObject {
    @Published var lessons: [Lesson] = []
    @Published var settings = Database.defaults
    @Published var error: String?
    @Published var notice: String?
    @Published var importPreview: ImportPreview?
    @Published var isProcessingFile = false
    @Published var notificationStatus = "尚未检查"
    @Published var requestedLessonID: String?
    private(set) var database: Database?
    private var loadedRevision: Database.Revision?
    private var notificationTask: Task<Void, Never>?
    let isPreview: Bool

    init() {
        isPreview = ProcessInfo.processInfo.arguments.contains("--preview")
        do {
            let directory: URL
            if isPreview {
                directory = FileManager.default.temporaryDirectory.appendingPathComponent("LessonLedger-Preview-\(UUID().uuidString)")
            } else {
                directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                    .appendingPathComponent("LessonLedger", isDirectory: true)
            }
            database = try Database(url: directory.appendingPathComponent("lesson-ledger.db"))
            if isPreview { try seedPreview() }
            try reload()
        } catch { self.error = error.localizedDescription }
    }
    var pending: [Lesson] { lessons.filter { $0.status.isOpen && $0.end < Date() } }
    var theme: ThemeColor { ThemeColor.resolve(settings["theme_color"]) }
    var accent: Color { theme.primary }
    var scheme: ColorScheme? {
        settings["theme_mode"] == "dark" ? .dark : (settings["theme_mode"] == "light" ? .light : nil)
    }
    func requireDatabase() throws -> Database {
        guard let database else { throw LedgerError.message("数据库未能打开，请重新启动应用。") }
        return database
    }
    func reload() throws {
        let db = try requireDatabase()
        try db.refreshPending()
        let revision = try db.revision()
        guard revision != loadedRevision else { return }
        let updatedLessons = try db.lessons()
        let updatedSettings = try db.settings()
        // Keep the revision captured before reading so a concurrent external commit
        // cannot be accidentally marked as already loaded.
        loadedRevision = revision
        if lessons != updatedLessons { lessons = updatedLessons }
        if settings != updatedSettings { settings = updatedSettings }
        let count = pending.count
        let badge = count == 0 ? nil : String(count)
        if NSApp.dockTile.badgeLabel != badge { NSApp.dockTile.badgeLabel = badge }
    }
    @discardableResult func perform(_ action: () throws -> Void) -> Bool {
        do { try action(); try reload(); scheduleNotifications(); return true }
        catch { self.error = error.localizedDescription; return false }
    }
    func save(_ draft: LessonDraft, editingID: String?) -> Bool {
        perform { try requireDatabase().save(draft.validated(), editingID: editingID) }
    }
    func pasteCourse(_ course: CalendarCopiedCourse, at target: CalendarPasteTarget) -> Bool {
        perform { try requireDatabase().save(course.makeLesson(at: target)) }
    }
    @discardableResult func reschedule(_ id: String, to date: Date, keepingTime: Bool = true) -> Bool {
        perform {
            let db = try requireDatabase()
            guard let lesson = try db.lessons().first(where: { $0.id == id }) else {
                throw LedgerError.message("这节课程已不存在，请刷新后重试。")
            }
            let moved: Lesson
            if keepingTime { moved = try CourseCalendar.moving(lesson, to: date) }
            else { moved = try CourseCalendar.moving(lesson, startingAt: date) }
            try db.save(moved, editingID: id)
        }
    }
    func setSetting(_ key: String, _ value: String) {
        _ = perform { try requireDatabase().setSetting(key, value) }
    }
    func setting(_ key: String, fallback: String = "") -> Binding<String> {
        Binding(get: { self.settings[key] ?? fallback }, set: { self.setSetting(key, $0) })
    }
    func scheduleNotifications(askPermission: Bool = false) {
        guard !isPreview else { return }
        notificationTask?.cancel()
        notificationTask = Task { await syncNotifications(askPermission: askPermission) }
    }
    private func syncNotifications(askPermission: Bool) async {
        let center = UNUserNotificationCenter.current()
        do {
            if askPermission {
                _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            }
            let authorization = await center.notificationSettings()
            guard !Task.isCancelled else { return }
            let granted = authorization.authorizationStatus == .authorized || authorization.authorizationStatus == .provisional
            let status = granted ? "已允许" : "未允许，请在系统设置中开启"
            if notificationStatus != status { notificationStatus = status }
            let existing = await center.pendingNotificationRequests()
            guard !Task.isCancelled else { return }
            let owned = existing.filter { $0.identifier.hasPrefix("lesson-") }
            let existingByID = Dictionary(uniqueKeysWithValues: owned.map { ($0.identifier, $0) })
            guard settings["notifications_enabled"] != "false", granted else {
                center.removePendingNotificationRequests(withIdentifiers: owned.map(\.identifier)); return
            }
            let minutes = min(30, max(0, Double(settings["remind_before_minutes"] ?? "5") ?? 5))
            let direction: Double = settings["remind_timing"] == "after" ? 1 : -1
            let deadline = Date().addingTimeInterval(14 * 86400)
            let upcoming = lessons.filter { $0.status.isOpen && $0.end <= deadline && $0.end.addingTimeInterval(direction * minutes * 60) > Date() }
                .sorted { $0.end < $1.end }.prefix(50)
            let desired = Set(upcoming.map { "lesson-\($0.id)" })
            center.removePendingNotificationRequests(withIdentifiers: owned.filter { !desired.contains($0.identifier) }.map(\.identifier))
            for lesson in upcoming {
                guard !Task.isCancelled else { return }
                let date = lesson.end.addingTimeInterval(direction * minutes * 60)
                let content = UNMutableNotificationContent()
                content.title = direction < 0 ? "课程快结束了" : "课程已结束"
                content.body = "\(lesson.title)，点击确认 \(money(lesson.defaultAmount))"
                content.sound = .default; content.userInfo = ["lessonId": lesson.id]
                let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
                if let previous = existingByID["lesson-\(lesson.id)"],
                   let previousTrigger = previous.trigger as? UNCalendarNotificationTrigger,
                   previousTrigger.dateComponents == parts,
                   previous.content.title == content.title, previous.content.body == content.body,
                   previous.content.userInfo["lessonId"] as? String == lesson.id {
                    continue
                }
                let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                try await center.add(UNNotificationRequest(identifier: "lesson-\(lesson.id)", content: content, trigger: trigger))
            }
        } catch { if !Task.isCancelled { notificationStatus = "提醒设置失败：\(error.localizedDescription)" } }
    }
    func chooseImport() {
        let panel = NSOpenPanel()
        panel.title = "导入课程"; panel.allowedContentTypes = [UTType(filenameExtension: "xlsx")!, UTType(filenameExtension: "xls")!]
        panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        isProcessingFile = true
        Task {
            do {
                let result = try await Task.detached(priority: .userInitiated) { try Spreadsheet().read(url) }.value
                importPreview = result
            } catch { self.error = error.localizedDescription }
            isProcessingFile = false
        }
    }
    func commitImport(_ preview: ImportPreview) {
        if perform({ try requireDatabase().importLessons(preview.lessons, filename: preview.filename, totalRows: preview.totalRows, failures: preview.failures.count) }) {
            importPreview = nil; notice = "已导入 \(preview.lessons.count) 节课程。"
        }
    }
    func exportExcel(template: Bool = false) {
        let panel = NSSavePanel(); panel.allowedContentTypes = [UTType(filenameExtension: "xlsx")!]
        panel.nameFieldStringValue = template ? "钱来-课程导入模板.xlsx" : "钱来-数据导出-\(LedgerDate.day(Date())).xlsx"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let snapshot = template ? [] : lessons, preferences = template ? [:] : settings
        isProcessingFile = true
        Task {
            do {
                try await Task.detached(priority: .userInitiated) { try Spreadsheet().write(lessons: snapshot, settings: preferences, to: url) }.value
                notice = "已保存到 \(url.lastPathComponent)。"
            } catch { self.error = error.localizedDescription }
            isProcessingFile = false
        }
    }
    func backup() {
        let panel = NSSavePanel(); panel.nameFieldStringValue = "钱来-备份-\(LedgerDate.day(Date())).db"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try requireDatabase().backup(to: url); notice = "数据库备份已保存。" }
        catch { self.error = error.localizedDescription }
    }
    private func seedPreview() throws {
        let db = try requireDatabase()
        let names = ["林小满", "陈一诺", "周予安、许知夏", "沈书言", "林小满", "陈一诺"]
        for offset in -14...5 {
            for index in 0..<2 {
                var draft = LessonDraft()
                draft.date = Calendar.current.date(byAdding: .day, value: offset, to: Date())!
                draft.start = Calendar.current.date(bySettingHour: index == 0 ? 10 : 15, minute: 0, second: 0, of: Date())!
                draft.end = draft.start.addingTimeInterval(3600)
                draft.students = names[abs(offset + index) % names.count]; draft.grade = "七年级"
                draft.courseType = index == 0 ? "一对一" : "小班课"; draft.amount = index == 0 ? "150" : "240"
                draft.note = "演示数据，仅用于界面预览"
                var lesson = try draft.validated()
                if offset < -2 { lesson.status = .confirmed; lesson.finalAmount = lesson.defaultAmount }
                try db.save(lesson)
            }
        }
    }
}
