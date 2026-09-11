import AppKit
import SwiftUI

struct CalendarPasteTarget: Equatable {
    var date: Date
    var keepingTime: Bool
    static func day(_ date: Date) -> Self { .init(date: date, keepingTime: true) }
    static func time(_ date: Date) -> Self { .init(date: date, keepingTime: false) }
}

/// A clipboard snapshot is a template, never a reference to the original row
/// or a copy of its confirmed income, cancellation, or deletion state.
struct CalendarCopiedCourse: Codable {
    var version = 1
    var title: String
    var students: [String]
    var start: Date
    var end: Date
    var grade: String
    var courseType: String
    var defaultAmount: Double
    var note: String

    init(_ lesson: Lesson) {
        title = lesson.title; students = lesson.students; start = lesson.start; end = lesson.end
        grade = lesson.grade; courseType = lesson.courseType; defaultAmount = lesson.defaultAmount; note = lesson.note
    }

    func makeLesson(at target: CalendarPasteTarget, now: Date = Date(), calendar: Calendar = .current) throws -> Lesson {
        guard version == 1, !students.isEmpty, students.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
              start.timeIntervalSinceReferenceDate.isFinite, end.timeIntervalSinceReferenceDate.isFinite,
              end > start, calendar.isDate(start, inSameDayAs: end) else {
            throw LedgerError.message("剪贴板中的课程数据无效，请重新复制。")
        }
        let amount = try parseAmount(String(defaultAmount))
        let source = Lesson(id: UUID().uuidString, title: title, students: students, start: start, end: end,
                            grade: grade, courseType: courseType, defaultAmount: amount,
                            finalAmount: nil, status: .scheduled, note: note)
        var result = target.keepingTime
            ? try CourseCalendar.moving(source, to: target.date, calendar: calendar)
            : try CourseCalendar.moving(source, startingAt: target.date, calendar: calendar)
        result.status = result.end < now ? .pending : .scheduled
        return result
    }
}

@MainActor final class CalendarClipboard: ObservableObject {
    static let shared = CalendarClipboard()
    static let pasteboardType = NSPasteboard.PasteboardType("com.lishuo.lesson.course.v1")
    @Published private(set) var revision = 0
    weak var window: NSWindow?
    private var keyMonitor: Any?
    private var pasteAction: ((CalendarCopiedCourse, CalendarPasteTarget) -> Bool)?
    private var hovered: (owner: UUID, lesson: Lesson?, target: CalendarPasteTarget)?
    private var selected: Lesson?
    private var selectedTarget: CalendarPasteTarget?
    private var fallback: CalendarPasteTarget?

    var canPaste: Bool { copiedCourse != nil }
    private var copiedCourse: CalendarCopiedCourse? {
        guard let data = NSPasteboard.general.data(forType: Self.pasteboardType),
              let course = try? JSONDecoder().decode(CalendarCopiedCourse.self, from: data), course.version == 1 else { return nil }
        return course
    }

    func activate(fallback: CalendarPasteTarget, paste: @escaping (CalendarCopiedCourse, CalendarPasteTarget) -> Bool) {
        self.fallback = fallback; pasteAction = paste
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            let handled = MainActor.assumeIsolated { self?.handle(event) ?? false }
            return handled ? nil : event
        }
    }

    func deactivate() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        keyMonitor = nil; pasteAction = nil; hovered = nil; selected = nil; selectedTarget = nil; fallback = nil; window = nil
    }

    func updateFallback(_ target: CalendarPasteTarget) { fallback = target }
    func clearHover() { hovered = nil }
    func hover(owner: UUID, lesson: Lesson? = nil, target: CalendarPasteTarget) { hovered = (owner, lesson, target) }
    func leave(owner: UUID) { if hovered?.owner == owner { hovered = nil } }
    func select(_ lesson: Lesson, target: CalendarPasteTarget) { selected = lesson; selectedTarget = target }
    func selectTarget(_ target: CalendarPasteTarget) { selectedTarget = target }
    func refresh(_ lessons: [Lesson]) {
        if let selected { self.selected = lessons.first(where: { $0.id == selected.id }) }
        if let old = hovered?.lesson { hovered?.lesson = lessons.first(where: { $0.id == old.id }) }
    }

    func copy(_ lesson: Lesson) {
        guard let data = try? JSONEncoder().encode(CalendarCopiedCourse(lesson)) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setData(data, forType: Self.pasteboardType)
        NSPasteboard.general.setString("\(lesson.title) · \(LedgerDate.day(lesson.start)) · \(lesson.timeText)", forType: .string)
        selected = lesson
        revision &+= 1
    }

    @discardableResult func paste(at explicitTarget: CalendarPasteTarget? = nil) -> Bool {
        guard let course = copiedCourse,
              let target = explicitTarget ?? hovered?.target ?? selectedTarget ?? fallback,
              let pasteAction else { return false }
        return pasteAction(course, target)
    }

    func pasteMenuItem(at target: CalendarPasteTarget) -> NSMenuItem {
        let item = CalendarActionMenuItem(title: "粘贴课程") { [weak self] in self?.paste(at: target) }
        item.isEnabled = canPaste
        return item
    }

    private func handle(_ event: NSEvent) -> Bool {
        guard let window, window.attachedSheet == nil,
              let keyWindow = NSApp.keyWindow,
              keyWindow == window || keyWindow.parent == window,
              !(keyWindow.firstResponder is NSText), !(keyWindow.firstResponder is NSTextField),
              event.modifierFlags.intersection([.command, .shift, .option, .control]) == .command,
              !event.isARepeat else { return false }
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "c":
            guard let lesson = hovered?.lesson ?? selected else { return false }
            copy(lesson); return true
        case "v":
            guard canPaste else { return false }
            _ = paste(); return true
        default: return false
        }
    }
}

/// Associates shortcuts with this calendar's window without changing the responder
/// chain; text fields and modal editors retain their ordinary copy/paste behavior.
struct CalendarClipboardHost: NSViewRepresentable {
    func makeNSView(context: Context) -> HostView { HostView() }
    func updateNSView(_ nsView: HostView, context: Context) {}
    final class HostView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window { CalendarClipboard.shared.window = window }
        }
    }
}
