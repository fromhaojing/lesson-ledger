import XCTest
@testable import LessonLedger

final class CourseCalendarTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return calendar
    }
    private func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0, calendar: Calendar? = nil) -> Date {
        (calendar ?? self.calendar).date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    func testMonthGridIncludesAdjacentDatesAndLeapDay() {
        let september = CourseCalendar.days(in: date(2026, 9, 9), calendar: calendar)
        XCTAssertEqual(september.count, 35)
        XCTAssertEqual(september.first, date(2026, 8, 30))
        XCTAssertEqual(september.last, date(2026, 10, 3))
        let leapMonth = CourseCalendar.days(in: date(2028, 2, 1), calendar: calendar)
        XCTAssertTrue(leapMonth.contains(date(2028, 2, 29)))
        XCTAssertEqual(CourseCalendar.days(in: date(2026, 8, 1), calendar: calendar).count, 42)
        XCTAssertEqual(CourseCalendar.days(in: date(2026, 2, 1), calendar: calendar).count, 28)
        for month in 1...12 {
            let days = CourseCalendar.days(in: date(2026, month, 15), calendar: calendar)
            XCTAssertEqual(calendar.component(.weekday, from: days.first!), 1)
            XCTAssertEqual(calendar.component(.weekday, from: days.last!), 7)
            XCTAssertEqual(Set(days).count, days.count)
        }
    }

    func testVirtualWeeksStayContinuousAndBoundedWhenRecentered() {
        var weeks = CourseCalendar.weeks(around: date(2026, 9, 9), calendar: calendar)
        for _ in 0..<20 {
            XCTAssertEqual(weeks.count, 157)
            XCTAssertEqual(Set(weeks).count, 157)
            for pair in zip(weeks, weeks.dropFirst()) {
                XCTAssertEqual(calendar.dateComponents([.day], from: pair.0, to: pair.1).day, 7)
                XCTAssertEqual(calendar.component(.weekday, from: pair.0), 1)
            }
            let visible = weeks[weeks.count - 15]
            XCTAssertTrue(CourseCalendar.needsRecentering(visible, in: weeks))
            weeks = CourseCalendar.weeks(around: visible, calendar: calendar)
            XCTAssertEqual(weeks[78], visible)
            XCTAssertFalse(CourseCalendar.needsRecentering(visible, in: weeks))
        }
        let firstVisible = weeks[10]
        XCTAssertTrue(CourseCalendar.needsRecentering(firstVisible, in: weeks))
        XCTAssertEqual(CourseCalendar.weeks(around: firstVisible, calendar: calendar)[78], firstVisible)
    }

    func testMonthNavigationUsesTheMonthBeginningInTheTopWeek() {
        for month in 1...12 {
            let start = date(2026, month, 1)
            let week = CourseCalendar.weekStart(for: start, calendar: calendar)
            XCTAssertEqual(CourseCalendar.month(at: week, calendar: calendar), start)
        }
    }

    func testMovePersistsSameCourseAndRecalculatesStatus() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try Database(url: directory.appendingPathComponent("calendar.db"))
        var draft = LessonDraft()
        draft.students = "日历测试"; draft.note = "保留备注"; draft.grade = "七年级"
        var original = try draft.validated()
        original.start = date(2025, 12, 31, hour: 9)
        original.end = date(2025, 12, 31, hour: 11)
        original.status = .pending
        try database.save(original)
        let moved = try CourseCalendar.moving(original, to: date(2030, 1, 2), calendar: calendar)
        try database.save(moved, editingID: original.id)
        let reopened = try Database(url: database.url)
        let saved = try XCTUnwrap(reopened.lessons().first)
        XCTAssertEqual(saved.id, original.id)
        XCTAssertEqual(saved.start, date(2030, 1, 2, hour: 9))
        XCTAssertEqual(saved.end, date(2030, 1, 2, hour: 11))
        XCTAssertEqual(saved.defaultAmount, original.defaultAmount)
        XCTAssertEqual(saved.students, original.students)
        XCTAssertEqual(saved.note, original.note)
        XCTAssertEqual(saved.grade, original.grade)
        XCTAssertEqual(saved.status, .scheduled)
        let past = try CourseCalendar.moving(saved, to: date(2025, 1, 2), calendar: calendar)
        try database.save(past, editingID: saved.id)
        XCTAssertEqual(try database.lessons().first?.status, .pending)
        try database.confirm([saved.id])
        XCTAssertThrowsError(try database.save(moved, editingID: saved.id))
        for status in [LessonStatus.confirmed, .cancelled] {
            var locked = saved; locked.status = status
            XCTAssertThrowsError(try CourseCalendar.moving(locked, to: date(2030, 1, 3), calendar: calendar))
        }
    }

    func testMovePreservesWallClockAcrossDaylightSaving() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        var draft = LessonDraft(); draft.students = "测试"
        var original = try draft.validated()
        original.start = date(2026, 3, 7, hour: 9, calendar: calendar)
        original.end = date(2026, 3, 7, hour: 10, calendar: calendar)
        let moved = try CourseCalendar.moving(original, to: date(2026, 3, 8, calendar: calendar), calendar: calendar)
        XCTAssertEqual(calendar.component(.hour, from: moved.start), 9)
        XCTAssertEqual(calendar.component(.hour, from: moved.end), 10)
        XCTAssertEqual(moved.start.timeIntervalSince(original.start), 23 * 3600)
    }
}
