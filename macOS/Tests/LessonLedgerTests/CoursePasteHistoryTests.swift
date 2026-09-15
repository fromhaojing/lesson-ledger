import XCTest
@testable import LessonLedger

final class CoursePasteHistoryTests: XCTestCase {
    private var directory: URL!
    private var db: Database!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("PasteUndo-\(UUID().uuidString)")
        db = try Database(url: directory.appendingPathComponent("test.db"))
    }
    override func tearDownWithError() throws { db = nil; try FileManager.default.removeItem(at: directory) }
    private func course() throws -> Lesson {
        var draft = LessonDraft(); draft.students = "撤销测试"
        return try draft.validated()
    }

    func testUndoRemovesCopiesInReverseOrderAndPreservesTheOriginal() throws {
        let source = try course()
        try db.save(source)
        var history = CoursePasteHistory()
        var copies: [Lesson] = []
        for _ in 0..<3 {
            let copy = try CalendarCopiedCourse(source).makeLesson(at: .day(source.start))
            try db.save(copy); history.record(copy.id); copies.append(copy)
        }
        for copy in copies.reversed() {
            XCTAssertTrue(history.canUndo)
            try history.undo(in: db)
            XCTAssertFalse(try db.lessons().contains(where: { $0.id == copy.id }))
            XCTAssertEqual(try db.lessons().first(where: { $0.id == source.id }), source)
        }
        XCTAssertFalse(history.canUndo)
        XCTAssertEqual(try db.lessons(), [source])
        // Undo uses the same recoverable soft deletion as the rest of the app.
        XCTAssertEqual(try db.rows("SELECT COUNT(*) AS n FROM lesson WHERE deleted_at IS NOT NULL").first?["n"], "3")
    }

    func testFailedUndoKeepsHistoryAndCourseIntact() throws {
        let copy = try course(); try db.save(copy)
        var history = CoursePasteHistory(); history.record(copy.id)
        try db.execute("CREATE TRIGGER reject_delete BEFORE UPDATE OF deleted_at ON lesson BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        XCTAssertThrowsError(try history.undo(in: db))
        XCTAssertEqual(history.ids, [copy.id])
        XCTAssertEqual(try db.lessons(), [copy])
        try db.execute("DROP TRIGGER reject_delete")
        try history.undo(in: db)
        XCTAssertFalse(history.canUndo)
    }

    func testManuallyDeletedCopyIsRemovedFromUndoHistory() throws {
        let first = try course(), second = try course()
        try db.save(first); try db.save(second)
        var history = CoursePasteHistory(); history.record(first.id); history.record(second.id)
        try db.remove(second.id)
        history.reconcile(existingIDs: Set(try db.lessons().map(\.id)))
        XCTAssertEqual(history.ids, [first.id])
        try history.undo(in: db)
        XCTAssertTrue(try db.lessons().isEmpty)
    }

    func testUndoDoesNotModifyUnrelatedCourses() throws {
        let copy = try course(), unrelated = try course()
        try db.save(copy); try db.save(unrelated)
        try db.confirm([unrelated.id], amount: 128)
        let before = try db.lessons().first(where: { $0.id == unrelated.id })
        var history = CoursePasteHistory(); history.record(copy.id)
        try history.undo(in: db)
        XCTAssertEqual(try db.lessons(), [try XCTUnwrap(before)])
    }
}
