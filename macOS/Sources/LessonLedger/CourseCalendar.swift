import Foundation

enum CourseCalendar {
    static let dragPrefix = "lesson-ledger:course:"

    struct DayPresentation: Codable, Equatable, Sendable {
        var date: Date
        var month: Date
        var title: String
        var lunar: String
        var accessibility: String
        var isWeekend: Bool
        var number: Int
        var weekdayTitle: String
    }

    static func presentation(for date: Date, calendar: Calendar = .current) -> DayPresentation {
        CalendarDateCache.shared.day(date, calendar: calendar)
    }

    static func monthPresentation(for date: Date, calendar: Calendar = .current) -> CalendarDateCache.Month {
        CalendarDateCache.shared.month(date, calendar: calendar)
    }

    static func weekStart(for date: Date, calendar: Calendar = .current) -> Date {
        let day = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: 1 - calendar.component(.weekday, from: day), to: day)!
    }

    static func weeks(around date: Date, calendar: Calendar = .current) -> [Date] {
        let week = weekStart(for: date, calendar: calendar)
        return (-78...78).map { calendar.date(byAdding: .weekOfYear, value: $0, to: week)! }
    }

    static func needsRecentering(_ week: Date, in weeks: [Date]) -> Bool {
        guard let index = weeks.firstIndex(of: week) else { return true }
        return index < 20 || index >= weeks.count - 20
    }

    static func month(at week: Date, calendar: Calendar = .current) -> Date {
        let lastDay = calendar.date(byAdding: .day, value: 6, to: week)!
        return calendar.dateInterval(of: .month, for: lastDay)!.start
    }

    /// Complete Sunday–Saturday rows, including the adjacent months' dates.
    static func days(in month: Date, calendar: Calendar = .current) -> [Date] {
        let value = monthPresentation(for: month, calendar: calendar)
        return value.days.prefix(value.gridCount).map(\.date)
    }

    static func moving(_ lesson: Lesson, to day: Date, calendar: Calendar = .current) throws -> Lesson {
        guard lesson.status.isOpen else { throw LedgerError.message("已确认或已取消的课程无法改期。") }
        let offset = calendar.dateComponents([.day], from: calendar.startOfDay(for: lesson.start), to: calendar.startOfDay(for: day)).day!
        var moved = lesson
        // Preserve local class times across DST and month/year boundaries.
        moved.start = calendar.date(byAdding: .day, value: offset, to: lesson.start)!
        moved.end = calendar.date(byAdding: .day, value: offset, to: lesson.end)!
        guard moved.end > moved.start else { throw LedgerError.message("该日期的课程时间无效，请通过编辑课程调整。") }
        return moved
    }

    static func lunarLabel(_ date: Date) -> String {
        presentation(for: date).lunar
    }

    struct TimelinePlacement: Identifiable {
        var lesson: Lesson
        var startMinute: Double
        var endMinute: Double
        var column = 0
        var columnCount = 1
        var id: String { lesson.id }
        // Account for the minimum visible card height when placing very short lessons.
        var displayEnd: Double { min(1440, max(endMinute, startMinute + 15)) }
    }

    /// Pack each connected overlap group into reusable columns; touching endpoints don't overlap.
    static func timeline(_ lessons: [Lesson], on day: Date, calendar: Calendar = .current) -> [TimelinePlacement] {
        let dayStart = calendar.startOfDay(for: day)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
        let entries = lessons.filter { $0.start < dayEnd && $0.end > dayStart }.map { lesson in
            TimelinePlacement(
                lesson: lesson,
                startMinute: lesson.start <= dayStart ? 0 : minute(of: lesson.start, calendar: calendar),
                endMinute: lesson.end >= dayEnd ? 1440 : minute(of: lesson.end, calendar: calendar)
            )
        }.sorted {
            if $0.startMinute != $1.startMinute { return $0.startMinute < $1.startMinute }
            if $0.endMinute != $1.endMinute { return $0.endMinute > $1.endMinute }
            return $0.id < $1.id
        }
        var result: [TimelinePlacement] = []
        var group: [TimelinePlacement] = []
        var columnEnds: [Double] = []
        var groupEnd: Double = -1
        func flush() {
            for var event in group {
                event.columnCount = columnEnds.count
                result.append(event)
            }
            group.removeAll(keepingCapacity: true)
            columnEnds.removeAll(keepingCapacity: true)
        }
        for var event in entries {
            if !group.isEmpty && event.startMinute >= groupEnd { flush() }
            if let column = columnEnds.firstIndex(where: { $0 <= event.startMinute }) {
                event.column = column
                columnEnds[column] = event.displayEnd
            } else {
                event.column = columnEnds.count
                columnEnds.append(event.displayEnd)
            }
            groupEnd = group.isEmpty ? event.displayEnd : max(groupEnd, event.displayEnd)
            group.append(event)
        }
        flush()
        return result
    }

    static func minute(of date: Date, calendar: Calendar = .current) -> Double {
        let parts = calendar.dateComponents([.hour, .minute, .second], from: date)
        return Double((parts.hour ?? 0) * 60 + (parts.minute ?? 0)) + Double(parts.second ?? 0) / 60
    }

    static func time(on day: Date, minute: Double, calendar: Calendar = .current) -> Date {
        let snapped = min(1425, max(0, Int(minute / 15) * 15))
        return calendar.date(bySettingHour: snapped / 60, minute: snapped % 60, second: 0, of: day)!
    }

    static func moving(_ lesson: Lesson, startingAt date: Date, calendar: Calendar = .current) throws -> Lesson {
        guard lesson.status.isOpen else { throw LedgerError.message("已确认或已取消的课程无法改期。") }
        var moved = lesson
        moved.start = date
        moved.end = date.addingTimeInterval(lesson.end.timeIntervalSince(lesson.start))
        guard moved.end > moved.start, calendar.isDate(moved.start, inSameDayAs: moved.end) else {
            throw LedgerError.message("课程不能跨天，请选择更早的开始时间。")
        }
        return moved
    }

}
