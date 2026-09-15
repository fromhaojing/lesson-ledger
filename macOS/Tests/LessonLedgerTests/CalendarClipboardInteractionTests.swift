import AppKit
import XCTest
@testable import LessonLedger

@MainActor private final class MemoryCoursePasteboard: CalendarCoursePasteboard {
    var changeCount = 0
    var data: Data?
    var acceptsWrites = true
    func courseData() -> Data? { data }
    func writeCourse(_ data: Data, summary: String) -> Bool {
        guard acceptsWrites else { return false }
        self.data = data; changeCount += 1; return true
    }
}

final class CalendarClipboardInteractionTests: XCTestCase {
    private func course() throws -> Lesson {
        var draft = LessonDraft(); draft.students = "物理课程"; draft.amount = "120"
        return try draft.validated()
    }

    @MainActor func testCopyShowsFeedbackAndStartsPreviewOnlyAfterClipboardWriteSucceeds() async throws {
        let board = MemoryCoursePasteboard(), source = try course()
        let clipboard = CalendarClipboard(pasteboard: board)
        defer { clipboard.deactivate() }
        board.acceptsWrites = false
        clipboard.copy(source)
        XCTAssertFalse(clipboard.isPreviewActive)
        XCTAssertNil(clipboard.feedback)
        board.acceptsWrites = true
        clipboard.copy(source)
        XCTAssertTrue(clipboard.isPreviewActive)
        XCTAssertEqual(clipboard.feedback, "已复制「物理课程」")
        XCTAssertTrue(clipboard.canPaste)
    }

    @MainActor func testPreviewFollowsHoverAndClearsWhenClipboardIsReplaced() async throws {
        let board = MemoryCoursePasteboard(), source = try course()
        let clipboard = CalendarClipboard(pasteboard: board), owner = UUID()
        defer { clipboard.deactivate() }
        clipboard.hover(owner: owner, target: .day(source.start))
        XCTAssertNil(clipboard.preview)
        clipboard.copy(source)
        XCTAssertEqual(clipboard.preview?.target, .day(source.start))
        let next = Calendar.current.date(byAdding: .day, value: 2, to: source.start)!
        clipboard.hover(owner: owner, target: .time(next))
        XCTAssertEqual(clipboard.preview?.lesson.start, next)
        XCTAssertEqual(clipboard.preview?.lesson.end.timeIntervalSince(next), source.end.timeIntervalSince(source.start))
        board.data = nil; board.changeCount += 1
        clipboard.syncClipboard()
        XCTAssertNil(clipboard.preview)
        XCTAssertFalse(clipboard.canPaste)
        XCTAssertFalse(clipboard.isPreviewActive)
    }

    @MainActor func testPasteUsesPreviewIdentityAndAllocatesANewIdentityForNextPaste() async throws {
        let source = try course(), board = MemoryCoursePasteboard()
        let clipboard = CalendarClipboard(pasteboard: board)
        defer { clipboard.deactivate() }
        var saved: Lesson?
        clipboard.activate(fallback: .day(source.start), paste: { copy, target, id in
            saved = try? copy.makeLesson(at: target, id: id); return saved != nil
        })
        clipboard.copy(source)
        clipboard.hover(owner: UUID(), target: .day(source.start))
        let preview = try XCTUnwrap(clipboard.preview)
        XCTAssertTrue(clipboard.paste())
        XCTAssertEqual(saved, preview.lesson)
        XCTAssertTrue(clipboard.isPreviewActive)
        let nextPreview = try XCTUnwrap(clipboard.preview)
        XCTAssertNotEqual(nextPreview.lesson.id, preview.lesson.id)
        XCTAssertTrue(clipboard.paste())
        XCTAssertEqual(saved, nextPreview.lesson)
    }

    @MainActor func testEndingPreviewPreservesClipboardAndPastingWithoutResumingHighlight() async throws {
        let source = try course(), board = MemoryCoursePasteboard()
        let clipboard = CalendarClipboard(pasteboard: board), owner = UUID()
        defer { clipboard.deactivate() }
        var pastedTargets: [CalendarPasteTarget] = []
        clipboard.activate(fallback: .day(source.start), paste: { _, target, _ in pastedTargets.append(target); return true })
        clipboard.copy(source)
        clipboard.hover(owner: owner, target: .day(source.start))
        XCTAssertNotNil(clipboard.preview)
        let data = board.data, changeCount = board.changeCount

        clipboard.endPastePreview()
        XCTAssertFalse(clipboard.isPreviewActive)
        XCTAssertNil(clipboard.preview)
        XCTAssertTrue(clipboard.canPaste)
        XCTAssertEqual(board.data, data)
        XCTAssertEqual(board.changeCount, changeCount)
        let next = CalendarPasteTarget.day(Calendar.current.date(byAdding: .day, value: 2, to: source.start)!)
        clipboard.hover(owner: owner, target: next)
        clipboard.syncClipboard()
        XCTAssertNil(clipboard.preview)
        XCTAssertTrue(clipboard.paste())
        let explicit = CalendarPasteTarget.time(source.start)
        XCTAssertTrue(clipboard.paste(at: explicit))
        XCTAssertEqual(pastedTargets, [next, explicit])
        XCTAssertNil(clipboard.preview)
        XCTAssertFalse(clipboard.isPreviewActive)

        clipboard.copy(source)
        XCTAssertTrue(clipboard.isPreviewActive)
        XCTAssertEqual(clipboard.preview?.target, next)
    }

    @MainActor func testNavigationKeepsPreviewButLeavingCalendarEndsIt() async throws {
        let source = try course(), clipboard = CalendarClipboard(pasteboard: MemoryCoursePasteboard())
        defer { clipboard.deactivate() }
        clipboard.activate(fallback: .day(source.start), paste: { _, _, _ in true })
        clipboard.copy(source)
        let owner = UUID(), next = CalendarPasteTarget.time(source.start)
        clipboard.hover(owner: owner, target: .day(source.start))
        clipboard.leave(owner: owner)
        clipboard.clearHover()
        clipboard.updateFallback(next)
        XCTAssertTrue(clipboard.isPreviewActive)
        XCTAssertNil(clipboard.preview)
        clipboard.hover(owner: UUID(), target: next)
        XCTAssertEqual(clipboard.preview?.target, next)

        clipboard.deactivate()
        clipboard.activate(fallback: next, paste: { _, _, _ in true })
        clipboard.hover(owner: UUID(), target: next)
        XCTAssertFalse(clipboard.isPreviewActive)
        XCTAssertNil(clipboard.preview)
        XCTAssertTrue(clipboard.canPaste)
    }

    @MainActor func testExistingClipboardDoesNotAutomaticallyStartPreview() async throws {
        let source = try course(), board = MemoryCoursePasteboard()
        let clipboard = CalendarClipboard(pasteboard: board)
        defer { clipboard.deactivate() }
        XCTAssertTrue(board.writeCourse(try JSONEncoder().encode(CalendarCopiedCourse(source)), summary: source.title))
        clipboard.activate(fallback: .day(source.start), paste: { _, _, _ in true })
        clipboard.hover(owner: UUID(), target: .day(source.start))
        XCTAssertTrue(clipboard.canPaste)
        XCTAssertFalse(clipboard.isPreviewActive)
        XCTAssertNil(clipboard.preview)
    }

    @MainActor func testEscapeRespectsWindowAndTextEditingAndAllowsPasteAfterEndingPreview() async throws {
        _ = NSApplication.shared
        let window = NSWindow(), otherWindow = NSWindow()
        let source = try course(), clipboard = CalendarClipboard(pasteboard: MemoryCoursePasteboard())
        defer { clipboard.deactivate() }
        var pasted = 0
        clipboard.activate(fallback: .day(source.start), paste: { _, _, _ in pasted += 1; return true })
        clipboard.window = window
        clipboard.copy(source)
        clipboard.hover(owner: UUID(), target: .day(source.start))
        let escape = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                                  windowNumber: window.windowNumber, context: nil, characters: "\u{1b}",
                                                  charactersIgnoringModifiers: "\u{1b}", isARepeat: false, keyCode: 53))
        XCTAssertFalse(clipboard.handle(escape, in: otherWindow))
        let editor = NSTextView()
        window.contentView = editor
        XCTAssertTrue(window.makeFirstResponder(editor))
        XCTAssertFalse(clipboard.handle(escape, in: window))
        XCTAssertTrue(clipboard.isPreviewActive)
        window.makeFirstResponder(nil)
        XCTAssertTrue(clipboard.handle(escape, in: window))
        XCTAssertFalse(clipboard.isPreviewActive)
        XCTAssertNil(clipboard.preview)
        XCTAssertFalse(clipboard.handle(escape, in: window))

        let paste = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command, timestamp: 0,
                                                 windowNumber: window.windowNumber, context: nil, characters: "v",
                                                 charactersIgnoringModifiers: "v", isARepeat: false, keyCode: 9))
        XCTAssertTrue(clipboard.handle(paste, in: window))
        XCTAssertEqual(pasted, 1)
        XCTAssertNil(clipboard.preview)
    }

    @MainActor func testLeavingAnOldHoverOwnerDoesNotClearTheNewTarget() async throws {
        let clipboard = CalendarClipboard(pasteboard: MemoryCoursePasteboard()), source = try course()
        defer { clipboard.deactivate() }
        let oldOwner = UUID(), newOwner = UUID()
        clipboard.copy(source)
        clipboard.hover(owner: oldOwner, target: .day(source.start))
        clipboard.hover(owner: newOwner, target: .time(source.start))
        clipboard.leave(owner: oldOwner)
        XCTAssertNotNil(clipboard.preview)
        clipboard.leave(owner: newOwner)
        XCTAssertNil(clipboard.preview)
    }

    @MainActor func testUndoFeedbackAndDeactivation() async throws {
        let clipboard = CalendarClipboard(pasteboard: MemoryCoursePasteboard())
        var undone = 0
        clipboard.activate(fallback: .day(Date()), paste: { _, _, _ in false }, undoTitle: "粘贴课程", undo: { undone += 1; return true })
        XCTAssertTrue(clipboard.undo())
        XCTAssertEqual(undone, 1)
        XCTAssertEqual(clipboard.feedback, "已撤销粘贴课程")
        clipboard.deactivate()
        XCTAssertNil(clipboard.feedback)
        XCTAssertFalse(clipboard.undo())
    }
}
