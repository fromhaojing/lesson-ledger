import XCTest
@testable import LessonLedger

final class RegressionTests: XCTestCase {
    private var directory: URL!
    private let calendar = Calendar(identifier: .gregorian)

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("LedgerRegression-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: directory)
    }

    private func lesson(_ start: Int, _ end: Int) throws -> Lesson {
        var draft = LessonDraft()
        draft.students = "回归甲 / 回归乙"
        draft.date = try LedgerDate.parseDay("2030-09-11")
        draft.start = CourseCalendar.time(on: draft.date, minute: Double(start), calendar: calendar)
        draft.end = CourseCalendar.time(on: draft.date, minute: Double(end), calendar: calendar)
        draft.amount = "123.456"
        draft.grade = "七年级"
        draft.note = "中文备注 ' 引号 & 换行\n第二行"
        return try draft.validated()
    }

    func testTimelineOverlapsUseDistinctColumnsAndTouchingEndpointsReuseThem() throws {
        let first = try lesson(540, 600)
        let overlap = try lesson(570, 630)
        let touching = try lesson(600, 660)
        let separate = try lesson(660, 720)
        let entries = CourseCalendar.timeline([separate, touching, overlap, first], on: first.start, calendar: calendar)
        XCTAssertEqual(entries.map(\.lesson.id), [first.id, overlap.id, touching.id, separate.id])
        XCTAssertEqual(entries.map(\.columnCount), [2, 2, 2, 1])
        XCTAssertNotEqual(entries[0].column, entries[1].column)
        XCTAssertEqual(entries[0].column, entries[2].column)
        XCTAssertEqual(entries[3].column, 0)
    }

    func testTimelineMinimumCardHeightKeepsShortLessonsApart() throws {
        var first = try lesson(540, 555)
        first.end = first.start.addingTimeInterval(60)
        var second = first
        second.id = UUID().uuidString
        second.start = first.start.addingTimeInterval(5 * 60)
        second.end = second.start.addingTimeInterval(60)
        let entries = CourseCalendar.timeline([first, second], on: first.start, calendar: calendar)
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries.map(\.columnCount), [2, 2])
        XCTAssertNotEqual(entries[0].column, entries[1].column)
    }

    func testTimelineMovePreservesDurationAndRejectsCrossDay() throws {
        let original = try lesson(540, 630)
        let afternoon = CourseCalendar.time(on: original.start, minute: 915, calendar: calendar)
        let moved = try CourseCalendar.moving(original, startingAt: afternoon, calendar: calendar)
        XCTAssertEqual(moved.id, original.id)
        XCTAssertEqual(moved.end.timeIntervalSince(moved.start), 90 * 60)
        XCTAssertEqual(moved.defaultAmount, 123.46)
        let late = CourseCalendar.time(on: original.start, minute: 1425, calendar: calendar)
        XCTAssertThrowsError(try CourseCalendar.moving(original, startingAt: late, calendar: calendar))
        for status in [LessonStatus.confirmed, .cancelled] {
            var closed = original
            closed.status = status
            XCTAssertThrowsError(try CourseCalendar.moving(closed, startingAt: afternoon, calendar: calendar))
        }
    }

    func testCalendarSearchCountsOnlyMatchingCourses() throws {
        let first = try lesson(540, 600)
        var second = try lesson(630, 690)
        second.students = ["其他学生"]
        second.title = "其他课程"
        let snapshot = try CalendarLessonSnapshot.build(lessons: [first, second], search: "回归乙", calendar: calendar)
        let day = calendar.startOfDay(for: first.start)
        let month = calendar.dateInterval(of: .month, for: first.start)!.start
        let year = calendar.dateInterval(of: .year, for: first.start)!.start
        XCTAssertEqual(snapshot.days[day]?.map(\.id), [first.id])
        XCTAssertEqual(snapshot.monthCounts[month], 1)
        XCTAssertEqual(snapshot.yearCounts[year], 1)
        let empty = try CalendarLessonSnapshot.build(lessons: [first, second], search: "无匹配内容", calendar: calendar)
        XCTAssertTrue(empty.days.isEmpty)
        XCTAssertTrue(empty.monthCounts.isEmpty)
        XCTAssertTrue(empty.yearCounts.isEmpty)
    }

    func testDatabaseRevisionDetectsExternalWritesWithoutChangingOnIdleRefresh() throws {
        let url = directory.appendingPathComponent("revision.db")
        let db = try Database(url: url)
        let external = try Database(url: url)
        let before = try db.revision()
        try db.refreshPending()
        XCTAssertEqual(try db.revision(), before)
        try external.save(lesson(540, 600))
        XCTAssertNotEqual(try db.revision(), before)
        XCTAssertEqual(try db.lessons().count, 1)
    }

    func testExcelRoundTripPreservesEveryStatusAndTextField() throws {
        let codec = try Spreadsheet()
        let lessons = try LessonStatus.allCases.map { status in
            var value = try lesson(540, 600)
            value.status = status
            value.finalAmount = status == .confirmed ? 128.5 : (status == .cancelled ? 0 : nil)
            return value
        }
        let url = directory.appendingPathComponent("全部状态.xlsx")
        try codec.write(lessons: lessons, settings: [:], to: url)
        let preview = try codec.read(url)
        XCTAssertTrue(preview.failures.isEmpty)
        XCTAssertEqual(preview.lessons.count, lessons.count)
        for (original, imported) in zip(lessons, preview.lessons) {
            XCTAssertEqual(imported.status, original.status)
            XCTAssertEqual(imported.finalAmount, original.finalAmount)
            XCTAssertEqual(imported.defaultAmount, original.defaultAmount)
            XCTAssertEqual(imported.start, original.start)
            XCTAssertEqual(imported.end, original.end)
            XCTAssertEqual(imported.students, original.students)
            XCTAssertEqual(imported.title, original.title)
            XCTAssertEqual(imported.grade, original.grade)
            XCTAssertEqual(imported.note, original.note)
        }
    }

    func testEmptyExcelTemplateHasNoPhantomCourses() throws {
        let codec = try Spreadsheet()
        let url = directory.appendingPathComponent("template.xlsx")
        try codec.write(lessons: [], settings: [:], to: url)
        let preview = try codec.read(url)
        XCTAssertEqual(preview.totalRows, 0)
        XCTAssertTrue(preview.lessons.isEmpty)
        XCTAssertTrue(preview.failures.isEmpty)
    }

    func testDeletedCourseStaysDeletedAfterBackupRestore() throws {
        let db = try Database(url: directory.appendingPathComponent("original.db"))
        let original = try lesson(540, 600)
        try db.save(original)
        try db.remove(original.id)
        XCTAssertThrowsError(try db.confirm([original.id]))
        XCTAssertThrowsError(try db.cancel(original.id))
        XCTAssertThrowsError(try db.save(original, editingID: original.id))
        let backup = directory.appendingPathComponent("backup.db")
        try db.backup(to: backup)
        let restored = try Database(url: backup)
        XCTAssertTrue(try restored.lessons().isEmpty)
        XCTAssertEqual(try restored.rows("SELECT COUNT(*) AS count FROM lesson WHERE deleted_at IS NOT NULL").first?["count"], "1")
    }
}
