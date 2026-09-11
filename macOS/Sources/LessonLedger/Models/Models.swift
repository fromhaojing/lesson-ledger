import Foundation
import SwiftUI

extension Bundle {
    static var ledger: Bundle {
        if let url = Bundle.main.resourceURL?.appendingPathComponent("LessonLedger_LessonLedger.bundle"),
           let bundle = Bundle(url: url) { return bundle }
        return .module
    }
}

enum LedgerError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

enum LessonStatus: String, CaseIterable, Identifiable, Sendable {
    case scheduled, pending, confirmed, cancelled
    var id: String { rawValue }
    var title: String {
        switch self {
        case .scheduled: return "未开始"
        case .pending: return "待确认"
        case .confirmed: return "已确认"
        case .cancelled: return "已取消"
        }
    }
    var color: Color {
        switch self {
        case .scheduled: return .blue
        case .pending: return .orange
        case .confirmed: return .teal
        case .cancelled: return .secondary
        }
    }
    var isOpen: Bool { self == .scheduled || self == .pending }
}

struct Lesson: Identifiable, Equatable, Sendable {
    var id: String
    var title: String
    var students: [String]
    var start: Date
    var end: Date
    var grade: String
    var courseType: String
    var defaultAmount: Double
    var finalAmount: Double?
    var status: LessonStatus
    var note: String
    var studentText: String { students.joined(separator: "、") }
    var timeText: String { "\(LedgerDate.time(start)) – \(LedgerDate.time(end))" }
    var amount: Double { status == .confirmed ? (finalAmount ?? 0) : (status == .cancelled ? 0 : defaultAmount) }
}

struct LessonDraft {
    var students = ""
    var date = Date()
    var start = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date())!
    var end = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: Date())!
    var grade = ""
    var courseType = "一对一"
    var amount = "150"
    var note = ""
    var title = ""
    var restoredStatus: LessonStatus = .scheduled
    var restoredFinalAmount: Double?

    init() {}
    init(lesson: Lesson) {
        students = lesson.studentText; date = lesson.start; start = lesson.start; end = lesson.end
        grade = lesson.grade; courseType = lesson.courseType; amount = String(lesson.defaultAmount)
        note = lesson.note; title = lesson.title
    }
    func validated() throws -> Lesson {
        let names = students.components(separatedBy: CharacterSet(charactersIn: "/、,，"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !names.isEmpty else { throw LedgerError.message("请填写学生姓名。") }
        let from = LedgerDate.combine(date, start), to = LedgerDate.combine(date, end)
        guard to > from else { throw LedgerError.message("结束时间必须晚于开始时间。") }
        return Lesson(id: UUID().uuidString, title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? names.joined(separator: "、") : title,
                      students: names, start: from, end: to, grade: grade, courseType: courseType,
                      defaultAmount: try parseAmount(amount), finalAmount: restoredFinalAmount, status: restoredStatus, note: note)
    }
}

func parseAmount(_ text: String) throws -> Double {
    let cleaned = text.components(separatedBy: CharacterSet(charactersIn: "¥￥, ").union(.whitespacesAndNewlines)).joined()
    guard let value = Double(cleaned.isEmpty ? "0" : cleaned), value.isFinite, value >= 0 else {
        throw LedgerError.message("请输入大于或等于 0 的有效金额。")
    }
    guard (value * 100).isFinite else { throw LedgerError.message("金额超出可支持的范围。") }
    return (value * 100).rounded() / 100
}

func money(_ value: Double) -> String { value.formatted(.currency(code: "CNY").locale(Locale(identifier: "zh_CN"))) }

enum LedgerDate {
    static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = format; formatter.isLenient = false
        return formatter
    }
    // Shared immutable formatters keep view updates from repeatedly constructing ICU formatters.
    private static let dayDisplay = displayFormatter("yyyy-MM-dd")
    private static let timeDisplay = displayFormatter("HH:mm")
    private static let monthDisplay = displayFormatter("yyyy年M月")
    private static func displayFormatter(_ format: String) -> DateFormatter {
        let value = formatter(format)
        value.timeZone = .autoupdatingCurrent
        return value
    }
    static func day(_ date: Date) -> String { dayDisplay.string(from: date) }
    static func time(_ date: Date) -> String { timeDisplay.string(from: date) }
    static func month(_ date: Date) -> String { monthDisplay.string(from: date) }
    static func iso(_ date: Date) -> String {
        isoFormatter(fractional: true).string(from: date)
    }
    static func parseISO(_ text: String) throws -> Date {
        if let date = isoFormatter(fractional: true).date(from: text) ?? isoFormatter(fractional: false).date(from: text) { return date }
        throw LedgerError.message("数据库中存在无效时间：\(text)")
    }
    private static func isoFormatter(fractional: Bool) -> ISO8601DateFormatter {
        // Database reads parse two timestamps per course. Reuse parsers without sharing
        // mutable Foundation formatter instances with background import/export threads.
        let key = fractional ? "LessonLedger.ISO.fractional" : "LessonLedger.ISO.seconds"
        let cache = Thread.current.threadDictionary
        if let formatter = cache[key] as? ISO8601DateFormatter { return formatter }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = fractional ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        cache[key] = formatter
        return formatter
    }
    static func combine(_ date: Date, _ time: Date) -> Date {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: time)
        return Calendar.current.date(bySettingHour: parts.hour ?? 0, minute: parts.minute ?? 0, second: 0, of: date)!
    }
    static func parseDay(_ text: String) throws -> Date {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "/", with: "-")
        guard normalized.range(of: #"^\d{4}-\d{1,2}-\d{1,2}$"#, options: .regularExpression) != nil,
              let date = formatter("yyyy-M-d").date(from: normalized) else { throw LedgerError.message("日期格式错误。") }
        return date
    }
    static func parseTime(_ text: String) throws -> Date {
        guard text.range(of: #"^\d{1,2}:\d{2}$"#, options: .regularExpression) != nil,
              let date = formatter("H:mm").date(from: text) else { throw LedgerError.message("时间格式错误。") }
        return date
    }
}
