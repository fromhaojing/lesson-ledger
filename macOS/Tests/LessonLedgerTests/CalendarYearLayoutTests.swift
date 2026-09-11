import XCTest
@testable import LessonLedger

final class CalendarYearLayoutTests: XCTestCase {
    func testResponsiveBandsPreserveEveryMonthAndContinuousOffsets() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let years = (2025...2027).map { calendar.date(from: DateComponents(year: $0, month: 1, day: 1))! }
        for width: CGFloat in [180, 480, 960, 1400] {
            let bands = CalendarYearBand.build(years: years, width: width, calendar: calendar)
            let months = bands.flatMap(\.months)
            XCTAssertEqual(months.count, 36)
            XCTAssertEqual(Set(months).count, 36)
            XCTAssertEqual(bands.filter(\.first).count, 3)
            XCTAssertEqual(bands.first?.offset, 0)
            for (previous, next) in zip(bands, bands.dropFirst()) {
                XCTAssertEqual(next.offset, previous.offset + previous.height, accuracy: 0.001)
            }
            for band in bands {
                XCTAssertFalse(band.months.isEmpty)
                XCTAssertLessThanOrEqual(band.months.count, band.columns)
                XCTAssertGreaterThan(width - CGFloat(band.columns - 1) * CalendarYearBand.gap, 0)
                XCTAssertTrue(band.months.allSatisfy { calendar.isDate($0, equalTo: band.year, toGranularity: .year) })
            }
        }
    }

    func testPrependingYearsKeepsExistingMonthAnchors() throws {
        let calendar = Calendar(identifier: .gregorian)
        let year = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let previous = calendar.date(byAdding: .year, value: -1, to: year)!
        let old = CalendarYearBand.build(years: [year], width: 960, calendar: calendar)
        let extended = CalendarYearBand.build(years: [previous, year], width: 960, calendar: calendar)
        for band in old {
            let new = try XCTUnwrap(extended.first(where: { $0.months == band.months }))
            XCTAssertEqual(new.height, band.height)
            XCTAssertGreaterThan(new.offset, band.offset)
        }
    }
}
