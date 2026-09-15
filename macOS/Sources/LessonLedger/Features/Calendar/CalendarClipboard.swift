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

    func makeLesson(at target: CalendarPasteTarget, now: Date = Date(), calendar: Calendar = .current, id: String = UUID().uuidString) throws -> Lesson {
        guard version == 1, !students.isEmpty, students.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
              start.timeIntervalSinceReferenceDate.isFinite, end.timeIntervalSinceReferenceDate.isFinite,
              end > start, calendar.isDate(start, inSameDayAs: end) else {
            throw LedgerError.message("剪贴板中的课程数据无效，请重新复制。")
        }
        let amount = try parseAmount(String(defaultAmount))
        let source = Lesson(id: id, title: title, students: students, start: start, end: end,
                            grade: grade, courseType: courseType, defaultAmount: amount,
                            finalAmount: nil, status: .scheduled, note: note)
        var result = target.keepingTime
            ? try CourseCalendar.moving(source, to: target.date, calendar: calendar)
            : try CourseCalendar.moving(source, startingAt: target.date, calendar: calendar)
        result.status = result.end < now ? .pending : .scheduled
        return result
    }
}

struct CalendarPastePreview: Equatable {
    var target: CalendarPasteTarget
    var lesson: Lesson
}

@MainActor protocol CalendarCoursePasteboard {
    var changeCount: Int { get }
    func courseData() -> Data?
    func writeCourse(_ data: Data, summary: String) -> Bool
}

@MainActor private struct SystemCoursePasteboard: CalendarCoursePasteboard {
    var changeCount: Int { NSPasteboard.general.changeCount }
    func courseData() -> Data? { NSPasteboard.general.data(forType: CalendarClipboard.pasteboardType) }
    func writeCourse(_ data: Data, summary: String) -> Bool {
        NSPasteboard.general.clearContents()
        guard NSPasteboard.general.setData(data, forType: CalendarClipboard.pasteboardType) else { return false }
        NSPasteboard.general.setString(summary, forType: .string)
        return true
    }
}

@MainActor final class CalendarClipboard: ObservableObject {
    static let shared = CalendarClipboard()
    static let pasteboardType = NSPasteboard.PasteboardType("com.lishuo.lesson.course.v1")
    static let didChangePreview = Notification.Name("LessonLedger.calendarPastePreviewChanged")
    @Published private(set) var revision = 0
    @Published private(set) var preview: CalendarPastePreview?
    @Published private(set) var isPreviewActive = false
    @Published private(set) var feedback: String?
    @Published private(set) var undoTitle: String?
    private var undoAction: (() -> Bool)?
    private var feedbackTask: Task<Void, Never>?
    private var clipboardTimer: Timer?
    private var pasteboardChangeCount = -1
    private var nextPasteID = UUID().uuidString
    private var copiedCourse: CalendarCopiedCourse?
    private let pasteboard: any CalendarCoursePasteboard
    weak var window: NSWindow?
    private var keyMonitor: Any?
    private var pasteAction: ((CalendarCopiedCourse, CalendarPasteTarget, String) -> Bool)?
    private var hovered: (owner: UUID, lesson: Lesson?, target: CalendarPasteTarget)?
    private var selected: Lesson?
    private var selectedTarget: CalendarPasteTarget?
    private var fallback: CalendarPasteTarget?

    init(pasteboard: (any CalendarCoursePasteboard)? = nil) {
        self.pasteboard = pasteboard ?? SystemCoursePasteboard()
    }

    var canPaste: Bool { copiedCourse != nil }
    func syncClipboard() {
        guard pasteboardChangeCount != pasteboard.changeCount else { return }
        pasteboardChangeCount = pasteboard.changeCount
        copiedCourse = pasteboard.courseData()
            .flatMap { try? JSONDecoder().decode(CalendarCopiedCourse.self, from: $0) }
        if copiedCourse?.version != 1 { copiedCourse = nil }
        if copiedCourse == nil { endPastePreview() }
        nextPasteID = UUID().uuidString
        revision &+= 1
        updatePreview()
    }

    private func updatePreview() {
        let next: CalendarPastePreview?
        if isPreviewActive, window?.attachedSheet == nil, let target = hovered?.target, let course = copiedCourse,
           let lesson = try? course.makeLesson(at: target, id: nextPasteID) {
            next = CalendarPastePreview(target: target, lesson: lesson)
        } else { next = nil }
        guard preview != next else { return }
        preview = next
        NotificationCenter.default.post(name: Self.didChangePreview, object: self)
    }

    func showFeedback(_ text: String) {
        feedbackTask?.cancel()
        feedback = text
        feedbackTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
            guard !Task.isCancelled else { return }
            self?.feedback = nil
        }
    }

    func activate(fallback: CalendarPasteTarget, paste: @escaping (CalendarCopiedCourse, CalendarPasteTarget, String) -> Bool, undoTitle: String? = nil, undo: (() -> Bool)? = nil) {
        self.fallback = fallback; pasteAction = paste
        self.undoTitle = undoTitle; undoAction = undo
        syncClipboard()
        if clipboardTimer == nil {
            clipboardTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.syncClipboard(); self?.updatePreview() }
            }
            clipboardTimer?.tolerance = 0.2
        }
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            let handled = MainActor.assumeIsolated { self?.handle(event, in: NSApp.keyWindow) ?? false }
            return handled ? nil : event
        }
    }

    func deactivate() {
        endPastePreview()
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        clipboardTimer?.invalidate(); clipboardTimer = nil
        feedbackTask?.cancel(); feedbackTask = nil; feedback = nil
        undoAction = nil; undoTitle = nil
        keyMonitor = nil; pasteAction = nil; hovered = nil; selected = nil; selectedTarget = nil; fallback = nil; window = nil
        updatePreview()
    }

    func updateFallback(_ target: CalendarPasteTarget) { fallback = target }
    func endPastePreview() {
        isPreviewActive = false
        updatePreview()
    }
    func clearHover() { hovered = nil; updatePreview() }
    func hover(owner: UUID, lesson: Lesson? = nil, target: CalendarPasteTarget) {
        hovered = (owner, lesson, target); syncClipboard(); updatePreview()
    }
    func leave(owner: UUID) { if hovered?.owner == owner { clearHover() } }
    func select(_ lesson: Lesson, target: CalendarPasteTarget) { selected = lesson; selectedTarget = target }
    func selectTarget(_ target: CalendarPasteTarget) { selectedTarget = target }
    func refresh(_ lessons: [Lesson]) {
        if let selected { self.selected = lessons.first(where: { $0.id == selected.id }) }
        if let old = hovered?.lesson { hovered?.lesson = lessons.first(where: { $0.id == old.id }) }
    }

    func copy(_ lesson: Lesson) {
        guard let data = try? JSONEncoder().encode(CalendarCopiedCourse(lesson)) else { return }
        guard pasteboard.writeCourse(data, summary: "\(lesson.title) · \(LedgerDate.day(lesson.start)) · \(lesson.timeText)") else { return }
        selected = lesson
        syncClipboard()
        isPreviewActive = true
        updatePreview()
        showFeedback("已复制「\(lesson.title)」")
    }

    @discardableResult func paste(at explicitTarget: CalendarPasteTarget? = nil) -> Bool {
        syncClipboard()
        guard let course = copiedCourse,
              let target = explicitTarget ?? hovered?.target ?? selectedTarget ?? fallback,
              let pasteAction else { return false }
        guard pasteAction(course, target, nextPasteID) else { return false }
        nextPasteID = UUID().uuidString
        updatePreview()
        return true
    }

    func updateUndoTitle(_ title: String?) { undoTitle = title }

    @discardableResult func undo() -> Bool {
        guard let title = undoTitle, undoAction?() == true else { return false }
        showFeedback("已撤销\(title)")
        return true
    }

    func undoMenuItem() -> NSMenuItem {
        let item = CalendarActionMenuItem(title: undoTitle.map { "撤销\($0)" } ?? "撤销") { [weak self] in self?.undo() }
        item.isEnabled = undoTitle != nil
        return item
    }

    func pasteMenuItem(at target: CalendarPasteTarget) -> NSMenuItem {
        syncClipboard()
        let item = CalendarActionMenuItem(title: "粘贴课程") { [weak self] in self?.paste(at: target) }
        item.isEnabled = canPaste
        return item
    }

    func endPastePreviewMenuItem() -> NSMenuItem? {
        guard isPreviewActive else { return nil }
        return CalendarActionMenuItem(title: "结束粘贴预览") { [weak self] in self?.endPastePreview() }
    }

    func handle(_ event: NSEvent, in keyWindow: NSWindow?) -> Bool {
        guard let window, window.attachedSheet == nil,
              let keyWindow,
              keyWindow == window || keyWindow.parent == window,
              !(keyWindow.firstResponder is NSText), !(keyWindow.firstResponder is NSTextField),
              !event.isARepeat else { return false }
        let modifiers = event.modifierFlags.intersection([.command, .shift, .option, .control])
        if event.keyCode == 53, modifiers.isEmpty {
            // Popovers and text editors keep their own Escape behavior.
            guard keyWindow == window, isPreviewActive else { return false }
            endPastePreview()
            return true
        }
        guard modifiers == .command else { return false }
        syncClipboard()
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "c":
            guard let lesson = hovered?.lesson ?? selected else { return false }
            copy(lesson); return true
        case "z":
            guard undoTitle != nil else { return false }
            _ = undo(); return true
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
