import XCTest
@testable import LessonLedger

final class DatePickerCalendarTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return value
    }

    private func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    func testRangeIncludesBothEndpointDaysRegardlessOfTime() {
        let rules = DatePickerCalendar(calendar: calendar, lowerBound: date(2026, 9, 10, hour: 16),
                                       upperBound: date(2026, 9, 11, hour: 9))
        XCTAssertTrue(rules.contains(date(2026, 9, 10)))
        XCTAssertTrue(rules.contains(date(2026, 9, 11, hour: 23)))
        XCTAssertFalse(rules.contains(date(2026, 9, 9, hour: 23)))
        XCTAssertFalse(rules.contains(date(2026, 9, 12)))
        let sameDay = DatePickerCalendar(calendar: calendar, lowerBound: date(2026, 9, 10, hour: 16),
                                         upperBound: date(2026, 9, 10, hour: 9))
        XCTAssertTrue(sameDay.contains(date(2026, 9, 10)))
    }

    func testOneSidedRangesAndMonthNavigationRespectLimits() {
        let upper = DatePickerCalendar(calendar: calendar, upperBound: date(2026, 9, 1))
        let lower = DatePickerCalendar(calendar: calendar, lowerBound: date(2026, 9, 30, hour: 16))
        let august = calendar.dateInterval(of: .month, for: date(2026, 8, 1))!
        let september = calendar.dateInterval(of: .month, for: date(2026, 9, 1))!
        let october = calendar.dateInterval(of: .month, for: date(2026, 10, 1))!
        XCTAssertTrue(upper.contains(date(2020, 1, 1)))
        XCTAssertFalse(upper.contains(date(2026, 9, 2)))
        XCTAssertTrue(upper.intersects(august))
        XCTAssertTrue(upper.intersects(september))
        XCTAssertFalse(upper.intersects(october))
        XCTAssertFalse(lower.intersects(august))
        XCTAssertTrue(lower.intersects(september))
        XCTAssertTrue(lower.intersects(october))
        XCTAssertTrue(lower.contains(date(2030, 1, 1)))
        XCTAssertFalse(lower.contains(date(2026, 9, 29)))
    }

    func testSixWeekGridCoversLeapDaysAndYearBoundaries() {
        let rules = DatePickerCalendar(calendar: calendar)
        let leap = rules.days(in: date(2028, 2, 15))
        XCTAssertEqual(leap.count, 42)
        XCTAssertTrue(leap.contains(date(2028, 2, 29)))
        let december = rules.days(in: date(2026, 12, 31))
        XCTAssertEqual(december.first, date(2026, 11, 29))
        XCTAssertEqual(december.last, date(2027, 1, 9))
        for month in 1...12 {
            let days = rules.days(in: date(2026, month, 15))
            XCTAssertEqual(Set(days).count, 42)
            XCTAssertEqual(calendar.component(.weekday, from: days.first!), 1)
            XCTAssertEqual(calendar.component(.weekday, from: days.last!), 7)
        }
    }

    func testDayGridKeepsLocalMidnightAcrossDaylightSaving() {
        var local = calendar
        local.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let rules = DatePickerCalendar(calendar: local)
        let days = rules.days(in: date(2026, 3, 15))
        for (day, next) in zip(days, days.dropFirst()) {
            XCTAssertEqual(local.component(.hour, from: day), 0)
            XCTAssertEqual(local.dateComponents([.day], from: day, to: next).day, 1)
        }
        XCTAssertTrue(zip(days, days.dropFirst()).contains { $1.timeIntervalSince($0) == 23 * 3600 })
    }
}
