import XCTest
@testable import LessonLedger

final class CalendarClipboardTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }
    private func date(_ day: Int, hour: Int = 0, minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2030, month: 9, day: day, hour: hour, minute: minute))!
    }
    private var original: Lesson {
        Lesson(id: "original", title: "物理专题训练", students: ["甲", "乙"],
               start: date(11, hour: 9, minute: 15), end: date(11, hour: 10, minute: 45),
               grade: "七年级", courseType: "小班课", defaultAmount: 150.25,
               finalAmount: 128.5, status: .confirmed, note: "中文备注\n保留第二行")
    }

    func testDayPastePreservesClockTimesAndCourseFields() throws {
        let pasted = try CalendarCopiedCourse(original).makeLesson(at: .day(date(14)), now: date(1), calendar: calendar)
        XCTAssertNotEqual(pasted.id, original.id)
        XCTAssertEqual(pasted.start, date(14, hour: 9, minute: 15))
        XCTAssertEqual(pasted.end, date(14, hour: 10, minute: 45))
        XCTAssertEqual(pasted.title, original.title)
        XCTAssertEqual(pasted.students, original.students)
        XCTAssertEqual(pasted.grade, original.grade)
        XCTAssertEqual(pasted.courseType, original.courseType)
        XCTAssertEqual(pasted.defaultAmount, original.defaultAmount)
        XCTAssertEqual(pasted.note, original.note)
    }

    func testTimelinePasteUsesTargetTimeAndPreservesDuration() throws {
        let pasted = try CalendarCopiedCourse(original).makeLesson(at: .time(date(14, hour: 13, minute: 30)), now: date(1), calendar: calendar)
        XCTAssertEqual(pasted.start, date(14, hour: 13, minute: 30))
        XCTAssertEqual(pasted.end, date(14, hour: 15))
    }

    func testPastedCoursesNeverInheritConfirmationOrCancellation() throws {
        for status in LessonStatus.allCases {
            var source = original
            source.status = status
            let snapshot = CalendarCopiedCourse(source)
            let future = try snapshot.makeLesson(at: .day(date(14)), now: date(12), calendar: calendar)
            XCTAssertEqual(future.status, .scheduled)
            XCTAssertNil(future.finalAmount)
            let past = try snapshot.makeLesson(at: .day(date(10)), now: date(12), calendar: calendar)
            XCTAssertEqual(past.status, .pending)
            XCTAssertNil(past.finalAmount)
        }
    }

    func testRepeatedPasteInsertsIndependentRowsAndPreservesOriginal() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ClipboardTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let db = try Database(url: directory.appendingPathComponent("test.db"))
        try db.save(original)
        let snapshot = CalendarCopiedCourse(original)
        for _ in 0..<3 {
            try db.save(snapshot.makeLesson(at: .day(date(14)), now: date(1), calendar: calendar))
        }
        let lessons = try db.lessons()
        XCTAssertEqual(lessons.count, 4)
        XCTAssertEqual(Set(lessons.map(\.id)).count, 4)
        XCTAssertEqual(lessons.first(where: { $0.id == original.id }), original)
        XCTAssertEqual(lessons.filter { $0.status == .confirmed }.count, 1)
    }

    func testClipboardSnapshotSurvivesOriginalEditsAndSerialization() throws {
        var source = original
        let data = try JSONEncoder().encode(CalendarCopiedCourse(source))
        source.title = "修改后的课程"
        source.defaultAmount = 999
        let snapshot = try JSONDecoder().decode(CalendarCopiedCourse.self, from: data)
        let pasted = try snapshot.makeLesson(at: .day(date(14)), now: date(1), calendar: calendar)
        XCTAssertEqual(pasted.title, original.title)
        XCTAssertEqual(pasted.defaultAmount, original.defaultAmount)
        XCTAssertNotEqual(pasted.title, source.title)
    }

    func testInvalidClipboardAndCrossMidnightPasteAreRejected() throws {
        let snapshot = CalendarCopiedCourse(original)
        XCTAssertThrowsError(try snapshot.makeLesson(at: .time(date(14, hour: 23)), calendar: calendar))
        var invalid = snapshot
        invalid.version = 2
        XCTAssertThrowsError(try invalid.makeLesson(at: .day(date(14)), calendar: calendar))
        invalid = snapshot; invalid.students = []
        XCTAssertThrowsError(try invalid.makeLesson(at: .day(date(14)), calendar: calendar))
        invalid = snapshot; invalid.defaultAmount = -1
        XCTAssertThrowsError(try invalid.makeLesson(at: .day(date(14)), calendar: calendar))
        invalid = snapshot; invalid.end = invalid.start
        XCTAssertThrowsError(try invalid.makeLesson(at: .day(date(14)), calendar: calendar))
    }
}
