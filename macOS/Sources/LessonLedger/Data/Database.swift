import Foundation
import CSQLite

final class Database {
    private var handle: OpaquePointer?
    let url: URL
    init(url: URL) throws {
        self.url = url
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard sqlite3_open(url.path, &handle) == SQLITE_OK else {
            let error = failure(); sqlite3_close(handle); handle = nil; throw error
        }
        sqlite3_busy_timeout(handle, 5000)
        try execute("PRAGMA journal_mode = WAL")
        try execute("PRAGMA foreign_keys = ON")
        let schemaURL = Bundle.ledger.url(forResource: "schema", withExtension: "sql")!
        let schema = try String(contentsOf: schemaURL)
        try transaction {
            guard sqlite3_exec(handle, schema, nil, nil, nil) == SQLITE_OK else { throw failure() }
            try execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
            try execute("UPDATE lesson SET status = 'cancelled', final_amount = 0, cancelled_at = COALESCE(cancelled_at, updated_at, created_at) WHERE status = 'absent'")
            for version in 1...3 {
                try execute("INSERT OR IGNORE INTO schema_migrations VALUES (?, ?)", [version, LedgerDate.iso(Date())])
            }
            for (key, value) in Self.defaults {
                try execute("INSERT OR IGNORE INTO app_setting VALUES (?, ?)", [key, value])
            }
            let savedTheme = try settings()["theme_color"]
            let restoredTheme = ThemeColor.resolve(savedTheme).rawValue
            if savedTheme != restoredTheme { try setSetting("theme_color", restoredTheme) }
        }
    }
    deinit { sqlite3_close(handle) }
    static let defaults = ["default_amount": "150", "remind_before_minutes": "5", "remind_timing": "before",
                           "notifications_enabled": "true", "notification_schedule_days": "14", "notification_schedule_limit": "50",
                           "currency": "CNY", "theme_mode": "unspecified", "theme_color": ThemeColor.defaultColor.rawValue]

    private func failure() -> LedgerError {
        .message("数据库操作失败：\(handle.map { String(cString: sqlite3_errmsg($0)) } ?? "无法打开文件")")
    }
    private func statement(_ sql: String, _ values: [Any?]) throws -> OpaquePointer {
        var pointer: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &pointer, nil) == SQLITE_OK, let pointer else { throw failure() }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            let result: Int32
            switch value {
            case nil: result = sqlite3_bind_null(pointer, index)
            case let value as Int: result = sqlite3_bind_int64(pointer, index, Int64(value))
            case let value as Double: result = sqlite3_bind_double(pointer, index, value)
            case let value as String: result = sqlite3_bind_text(pointer, index, value, -1, transient)
            default: sqlite3_finalize(pointer); throw LedgerError.message("不支持的数据库参数。")
            }
            if result != SQLITE_OK { sqlite3_finalize(pointer); throw failure() }
        }
        return pointer
    }
    @discardableResult func execute(_ sql: String, _ values: [Any?] = []) throws -> Int {
        let pointer = try statement(sql, values); defer { sqlite3_finalize(pointer) }
        let result = sqlite3_step(pointer)
        guard result == SQLITE_DONE || result == SQLITE_ROW else { throw failure() }
        return Int(sqlite3_changes(handle))
    }
    func rows(_ sql: String, _ values: [Any?] = []) throws -> [[String: String]] {
        let pointer = try statement(sql, values); defer { sqlite3_finalize(pointer) }
        var output: [[String: String]] = []
        while true {
            let result = sqlite3_step(pointer)
            if result == SQLITE_DONE { return output }
            guard result == SQLITE_ROW else { throw failure() }
            var row: [String: String] = [:]
            for i in 0..<sqlite3_column_count(pointer) {
                if let value = sqlite3_column_text(pointer, i) { row[String(cString: sqlite3_column_name(pointer, i))] = String(cString: value) }
            }
            output.append(row)
        }
    }
    func transaction(_ body: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")
        do { try body(); try execute("COMMIT") }
        catch { _ = try? execute("ROLLBACK"); throw error }
    }
    func lessons() throws -> [Lesson] {
        try rows("SELECT * FROM lesson WHERE deleted_at IS NULL ORDER BY start_at").map { row in
            guard let id = row["id"], let status = LessonStatus(rawValue: row["status"] ?? ""),
                  let studentData = row["student_names"]?.data(using: .utf8),
                  let names = try? JSONDecoder().decode([String].self, from: studentData),
                  let amount = Double(row["default_amount"] ?? "0"), amount.isFinite else {
                throw LedgerError.message("课程数据格式不正确。")
            }
            return Lesson(id: id, title: row["title"] ?? "", students: names,
                          start: try LedgerDate.parseISO(row["start_at"] ?? ""), end: try LedgerDate.parseISO(row["end_at"] ?? ""),
                          grade: row["grade"] ?? "", courseType: row["course_type"] ?? "", defaultAmount: amount,
                          finalAmount: row["final_amount"].flatMap(Double.init), status: status, note: row["note"] ?? "")
        }
    }

    struct Revision: Equatable {
        var localChanges: Int
        var otherConnections: String
    }

    /// total_changes covers this connection; data_version also catches another app/window
    /// writing through a different SQLite connection. A clock tick alone changes neither.
    func revision() throws -> Revision {
        guard let version = try rows("PRAGMA data_version").first?["data_version"] else {
            throw failure()
        }
        return Revision(localChanges: Int(sqlite3_total_changes(handle)), otherConnections: version)
    }

    func save(_ lesson: Lesson, editingID: String? = nil, batchID: String? = nil) throws {
        let students = String(data: try JSONEncoder().encode(lesson.students), encoding: .utf8)!
        let now = LedgerDate.iso(Date())
        let values: [Any?] = [lesson.title, students, LedgerDate.day(lesson.start), LedgerDate.iso(lesson.start), LedgerDate.iso(lesson.end),
                              lesson.grade, lesson.courseType, lesson.defaultAmount, lesson.note, now]
        if let editingID {
            let changed = try execute("""
                UPDATE lesson SET title=?, student_names=?, date_text=?, start_at=?, end_at=?, grade=?, course_type=?,
                default_amount=?, note=?, updated_at=?, status=?
                WHERE id=? AND deleted_at IS NULL AND status IN ('scheduled','pending')
                """, values + [lesson.end < Date() ? "pending" : "scheduled", editingID])
            guard changed > 0 else { throw LedgerError.message("这节课程已确认或已取消，无法编辑。") }
        } else {
            try execute("""
                INSERT INTO lesson (title, student_names, date_text, start_at, end_at, grade, course_type, default_amount,
                note, updated_at, id, import_batch_id, created_at, status, final_amount, confirmed_at, cancelled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, values + [lesson.id, batchID, now, lesson.status.rawValue, lesson.finalAmount,
                                lesson.status == .confirmed ? now : nil, lesson.status == .cancelled ? now : nil])
        }
    }
    func confirm(_ ids: [String], amount: Double? = nil, note: String? = nil) throws {
        if let amount, !amount.isFinite || amount < 0 { throw LedgerError.message("金额不是有效数字。") }
        try transaction {
            for id in Set(ids) {
                let now = LedgerDate.iso(Date())
                let changed = try execute("""
                    UPDATE lesson SET status='confirmed', final_amount=COALESCE(?, default_amount), confirmed_at=?,
                    note=COALESCE(?,note), updated_at=? WHERE id=? AND deleted_at IS NULL AND status IN ('scheduled','pending')
                    """, [amount, now, note, now, id])
                guard changed > 0 else { throw LedgerError.message("课程状态已变化，无法重复确认。") }
            }
        }
    }
    func cancel(_ id: String) throws {
        let now = LedgerDate.iso(Date())
        let changed = try execute("UPDATE lesson SET status='cancelled', final_amount=0, cancelled_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL AND status IN ('scheduled','pending')", [now, now, id])
        guard changed > 0 else { throw LedgerError.message("当前课程状态无法取消。") }
    }
    func remove(_ id: String) throws {
        try execute("UPDATE lesson SET deleted_at=?, updated_at=? WHERE id=?", [LedgerDate.iso(Date()), LedgerDate.iso(Date()), id])
    }
    func refreshPending() throws {
        let now = LedgerDate.iso(Date())
        try execute("UPDATE lesson SET status='pending', updated_at=? WHERE status='scheduled' AND end_at < ? AND deleted_at IS NULL", [now, now])
    }
    func importLessons(_ lessons: [Lesson], filename: String, totalRows: Int, failures: Int) throws {
        try transaction {
            let batchID = UUID().uuidString
            try execute("INSERT INTO import_batch (id,filename,imported_at,total_rows,success_rows,failed_rows) VALUES (?,?,?,?,?,?)",
                        [batchID, filename, LedgerDate.iso(Date()), totalRows, lessons.count, failures])
            for lesson in lessons { try save(lesson, batchID: batchID) }
        }
    }
    func settings() throws -> [String: String] {
        Dictionary(uniqueKeysWithValues: try rows("SELECT key,value FROM app_setting").compactMap { row in
            guard let key = row["key"], let value = row["value"] else { return nil }; return (key, value)
        })
    }
    func setSetting(_ key: String, _ value: String) throws {
        try execute("INSERT INTO app_setting VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, value])
    }
    func backup(to destination: URL) throws {
        guard destination.standardizedFileURL != url.standardizedFileURL else { throw LedgerError.message("请选择其他备份位置。") }
        var target: OpaquePointer?
        guard sqlite3_open(destination.path, &target) == SQLITE_OK else { sqlite3_close(target); throw LedgerError.message("无法创建备份。") }
        defer { sqlite3_close(target) }
        guard let backup = sqlite3_backup_init(target, "main", handle, "main") else { throw LedgerError.message("无法创建备份。") }
        let result = sqlite3_backup_step(backup, -1)
        let finish = sqlite3_backup_finish(backup)
        guard result == SQLITE_DONE, finish == SQLITE_OK else { throw LedgerError.message("备份失败，请换一个位置重试。") }
    }
}
