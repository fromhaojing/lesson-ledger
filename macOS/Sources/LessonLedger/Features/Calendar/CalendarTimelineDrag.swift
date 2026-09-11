import Foundation

enum TimelineDragPlacement {
    /// Shared by actual cards and the highlighted landing position, including
    /// the narrower lanes needed when the destination overlaps another course.
    static func frame(for entry: CourseCalendar.TimelinePlacement, dayIndex: Int,
                      columnWidth: CGFloat, hourHeight: CGFloat) -> CGRect {
        let laneWidth = columnWidth / CGFloat(entry.columnCount)
        return CGRect(x: CGFloat(dayIndex) * columnWidth + CGFloat(entry.column) * laneWidth + 3,
                      y: CGFloat(entry.startMinute) / 60 * hourHeight,
                      width: max(1, laneWidth - 5),
                      height: max(16, CGFloat(entry.endMinute - entry.startMinute) / 60 * hourHeight - 2))
    }

    static func destination(for lesson: Lesson, translation: CGSize, pointer: CGPoint,
                            days: [Date], columnWidth: CGFloat, hourHeight: CGFloat,
                            calendar: Calendar = .current) -> Date? {
        guard columnWidth > 0, hourHeight > 0, !days.isEmpty,
              pointer.x >= 0, pointer.x < columnWidth * CGFloat(days.count),
              pointer.y >= 0, pointer.y < hourHeight * 24 else { return nil }
        let duration = lesson.end.timeIntervalSince(lesson.start) / 60
        guard duration > 0, duration < 1440 else { return nil }
        // Preserve where the pointer grabbed the card: its top edge determines
        // the start time, not the pointer position inside the course.
        let minute = CourseCalendar.minute(of: lesson.start, calendar: calendar)
            + Double(translation.height / hourHeight) * 60
        let latest = floor((1439 - duration) / 15) * 15
        guard latest >= 0 else { return nil }
        let snapped = min(latest, max(0, (minute / 15).rounded() * 15))
        let day = days[Int(pointer.x / columnWidth)]
        return CourseCalendar.time(on: day, minute: snapped, calendar: calendar)
    }
}

struct TimelinePendingMoves {
    private var revision: UUID?
    private var lessons: [String: Lesson] = [:]

    mutating func record(_ lesson: Lesson, revision: UUID) {
        if self.revision != revision { lessons.removeAll(); self.revision = revision }
        lessons[lesson.id] = lesson
    }

    func hasMoves(for revision: UUID) -> Bool { self.revision == revision && !lessons.isEmpty }

    func applying(to source: [Lesson], revision: UUID) -> [Lesson] {
        guard hasMoves(for: revision) else { return source }
        return source.map { lessons[$0.id] ?? $0 }
    }
}
