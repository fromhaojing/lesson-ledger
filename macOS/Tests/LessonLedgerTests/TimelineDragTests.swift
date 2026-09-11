import XCTest
@testable import LessonLedger

final class TimelineDragTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }

    private func date(_ day: Int, hour: Int = 0, minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2030, month: 9, day: day, hour: hour, minute: minute))!
    }

    private var lesson: Lesson {
        Lesson(id: "dragged-course", title: "拖拽课程", students: ["测试学生"],
               start: date(11, hour: 9), end: date(11, hour: 10), grade: "", courseType: "一对一",
               defaultAmount: 150, finalAmount: nil, status: .scheduled, note: "保留备注")
    }

    func testDraggingKeepsGrabOffsetAndSnapsCardTopToQuarterHour() {
        // Grab 40 points below the card top, then move it down 16 points.
        // Pointer-based placement would incorrectly move it 45 minutes instead.
        let target = TimelineDragPlacement.destination(for: lesson, translation: CGSize(width: 0, height: 16),
            pointer: CGPoint(x: 40, y: 9 * 64 + 40 + 16), days: [date(11)], columnWidth: 100,
            hourHeight: 64, calendar: calendar)
        XCTAssertEqual(target, date(11, hour: 9, minute: 15))
    }

    func testWeekDragChangesDayWithoutChangingDurationOrIdentity() throws {
        let target = try XCTUnwrap(TimelineDragPlacement.destination(for: lesson,
            translation: CGSize(width: 200, height: 80), pointer: CGPoint(x: 240, y: 700),
            days: [date(11), date(12), date(13)], columnWidth: 100, hourHeight: 64, calendar: calendar))
        let moved = try CourseCalendar.moving(lesson, startingAt: target, calendar: calendar)
        XCTAssertEqual(moved.start, date(13, hour: 10, minute: 15))
        XCTAssertEqual(moved.end, date(13, hour: 11, minute: 15))
        XCTAssertEqual(moved.id, lesson.id)
        XCTAssertEqual(moved.note, lesson.note)
        XCTAssertEqual(moved.defaultAmount, lesson.defaultAmount)
    }

    func testOutsideDropIsCancelledAndDayEdgesStayValid() throws {
        for point in [CGPoint(x: -1, y: 600), CGPoint(x: 100, y: 600),
                      CGPoint(x: 40, y: -1), CGPoint(x: 40, y: 1536)] {
            XCTAssertNil(TimelineDragPlacement.destination(for: lesson, translation: .zero,
                pointer: point, days: [date(11)], columnWidth: 100, hourHeight: 64, calendar: calendar))
        }
        let earliest = TimelineDragPlacement.destination(for: lesson, translation: CGSize(width: 0, height: -1000),
            pointer: CGPoint(x: 40, y: 1), days: [date(11)], columnWidth: 100, hourHeight: 64, calendar: calendar)
        XCTAssertEqual(earliest, date(11))
        let latest = try XCTUnwrap(TimelineDragPlacement.destination(for: lesson,
            translation: CGSize(width: 0, height: 1000), pointer: CGPoint(x: 40, y: 1535),
            days: [date(11)], columnWidth: 100, hourHeight: 64, calendar: calendar))
        let moved = try CourseCalendar.moving(lesson, startingAt: latest, calendar: calendar)
        XCTAssertEqual(moved.start, date(11, hour: 22, minute: 45))
        XCTAssertTrue(calendar.isDate(moved.start, inSameDayAs: moved.end))
    }

    func testCommittedMoveStaysVisibleExactlyOnceUntilIndexRefresh() throws {
        var pending = TimelinePendingMoves()
        let revision = UUID()
        let moved = try CourseCalendar.moving(lesson, startingAt: date(12, hour: 11), calendar: calendar)
        pending.record(moved, revision: revision)
        let displayed = pending.applying(to: [lesson], revision: revision)
        XCTAssertEqual(displayed, [moved])
        XCTAssertTrue(CourseCalendar.timeline(displayed, on: date(11), calendar: calendar).isEmpty)
        XCTAssertEqual(CourseCalendar.timeline(displayed, on: date(12), calendar: calendar).map(\.id), [lesson.id])
        let refreshedRevision = UUID()
        XCTAssertFalse(pending.hasMoves(for: refreshedRevision))
        XCTAssertEqual(pending.applying(to: [moved], revision: refreshedRevision), [moved])
        XCTAssertTrue(pending.applying(to: [], revision: refreshedRevision).isEmpty)
    }

    func testQuickConsecutiveMovesPreserveBothCoursesBeforeRefresh() throws {
        let revision = UUID()
        var second = lesson
        second.id = "second-course"
        let firstMove = try CourseCalendar.moving(lesson, startingAt: date(12, hour: 11), calendar: calendar)
        let secondMove = try CourseCalendar.moving(second, startingAt: date(13, hour: 14), calendar: calendar)
        var pending = TimelinePendingMoves()
        pending.record(firstMove, revision: revision)
        pending.record(secondMove, revision: revision)
        XCTAssertEqual(pending.applying(to: [lesson, second], revision: revision), [firstMove, secondMove])
    }

    func testLandingHighlightUsesTheFinalOverlapLaneAndCourseDuration() throws {
        var existing = lesson
        existing.id = "existing-course"
        let moved = try CourseCalendar.moving(lesson, startingAt: date(11, hour: 9, minute: 15), calendar: calendar)
        let entries = CourseCalendar.timeline([existing, moved], on: date(11), calendar: calendar)
        let entry = try XCTUnwrap(entries.first(where: { $0.id == moved.id }))
        XCTAssertEqual(entry.columnCount, 2)
        let frame = TimelineDragPlacement.frame(for: entry, dayIndex: 1, columnWidth: 200, hourHeight: 64)
        XCTAssertEqual(frame.minX, 303)
        XCTAssertEqual(frame.minY, 592)
        XCTAssertEqual(frame.width, 95)
        XCTAssertEqual(frame.height, 62)
    }
}
