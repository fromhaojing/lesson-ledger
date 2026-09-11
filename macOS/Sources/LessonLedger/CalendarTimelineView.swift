import SwiftUI

struct CalendarTimelineView: View {
    var date: Date
    var showsWeek: Bool
    var isActive: Bool
    var calendarRevision: Int
    var index: CalendarLessonIndex
    var today: Date
    var create: (Date) -> Void
    var move: (String, Date) -> Bool
    var openDay: (Date) -> Void
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void
    private var calendar: Calendar { .current }
    private let hourHeight: CGFloat = 64
    private let gutter: CGFloat = 52
    @State private var hasInitialPosition = false

    private var days: [Date] {
        let start = showsWeek ? CourseCalendar.weekStart(for: date, calendar: calendar) : calendar.startOfDay(for: date)
        return (0..<(showsWeek ? 7 : 1)).map { calendar.date(byAdding: .day, value: $0, to: start)! }
    }

    var body: some View {
        let displayedDays = days
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear.frame(width: gutter, height: 44)
                ForEach(displayedDays, id: \.self) { day in
                    let info = CourseCalendar.presentation(for: day, calendar: calendar)
                    Button { openDay(day) } label: {
                        HStack(spacing: 6) {
                            Text(info.weekdayTitle)
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                            Text("\(info.number)")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(day == today ? .white : .primary)
                                .frame(width: 28, height: 28)
                                .background { if day == today { Circle().fill(.red) } }
                        }.frame(maxWidth: .infinity).padding(.vertical, 8).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                        .accessibilityLabel("\(info.accessibility)，查看日视图")
                }
            }.frame(height: 44)
            GeometryReader { geometry in
                let columnWidth = max(1, (geometry.size.width - gutter) / CGFloat(displayedDays.count))
                ScrollViewReader { proxy in
                    ScrollView(.vertical) {
                        HStack(alignment: .top, spacing: 0) {
                            VStack(spacing: 0) {
                                ForEach(0..<24) { hour in
                                    Text(String(format: "%02d:00", hour))
                                        .font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary)
                                        .frame(width: gutter - 8, height: hourHeight, alignment: .topTrailing)
                                        .frame(width: gutter, alignment: .leading)
                                        .id(hour)
                                }
                            }
                            ForEach(displayedDays, id: \.self) { day in
                                TimelineDayColumn(
                                    day: day, entries: index.timeline(on: day), width: columnWidth,
                                    hourHeight: hourHeight, isToday: day == today, isActive: isActive,
                                    create: create, move: move, edit: edit,
                                    confirm: confirm, cancel: cancel, remove: remove
                                )
                            }
                        }.padding(.top, 8)
                    }
                    .onAppear {
                        guard !hasInitialPosition else { return }
                        hasInitialPosition = true
                        proxy.scrollTo(initialHour, anchor: .top)
                    }
                    .onChange(of: date) { _, target in
                        if isActive, !showsWeek, calendar.isDateInToday(target) {
                            proxy.scrollTo(initialHour, anchor: .top)
                        }
                    }
                }
            }
        }.padding(.horizontal, 24)
    }

    private var initialHour: Int {
        guard !showsWeek, calendar.isDateInToday(date) else { return 8 }
        return max(0, calendar.component(.hour, from: Date()) - 1)
    }
}

private struct TimelineDayColumn: View {
    var day: Date
    var entries: [CourseCalendar.TimelinePlacement]
    var width: CGFloat
    var hourHeight: CGFloat
    var isToday: Bool
    var isActive: Bool
    var create: (Date) -> Void
    var move: (String, Date) -> Bool
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void
    @State private var isDropTarget = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            TimelineTimeSlots(day: day, hourHeight: hourHeight, create: create)
            Canvas { context, size in
                var hours = Path()
                var halves = Path()
                for hour in 0...24 {
                    let y = CGFloat(hour) * hourHeight
                    hours.move(to: CGPoint(x: 0, y: y))
                    hours.addLine(to: CGPoint(x: size.width, y: y))
                    if hour < 24 {
                        halves.move(to: CGPoint(x: 0, y: y + hourHeight / 2))
                        halves.addLine(to: CGPoint(x: size.width, y: y + hourHeight / 2))
                    }
                }
                hours.move(to: .zero)
                hours.addLine(to: CGPoint(x: 0, y: size.height))
                context.stroke(hours, with: .color(.primary.opacity(0.1)), lineWidth: 1)
                context.stroke(halves, with: .color(.primary.opacity(0.05)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }.allowsHitTesting(false)
            ForEach(entries) { entry in
                let laneWidth = width / CGFloat(entry.columnCount)
                let cardHeight = max(16, CGFloat(entry.endMinute - entry.startMinute) / 60 * hourHeight - 2)
                CalendarLessonItem(
                    lesson: entry.lesson, edit: edit, confirm: confirm, cancel: cancel, remove: remove,
                    isTimeline: true, showsTime: cardHeight >= 42
                )
                .frame(width: max(1, laneWidth - 5), height: cardHeight)
                .offset(x: CGFloat(entry.column) * laneWidth + 3, y: CGFloat(entry.startMinute) / 60 * hourHeight)
            }
        }
        .frame(width: width, height: hourHeight * 24)
        .background(Calendar.current.isDateInWeekend(day) ? Color.primary.opacity(0.02) : Color.clear)
        .overlay { if isDropTarget { Rectangle().fill(.blue.opacity(0.05)).allowsHitTesting(false) } }
        .overlay(alignment: .topLeading) {
            if isToday && isActive {
                CalendarCurrentTimeLine(day: day, width: width, hourHeight: hourHeight)
            }
        }
        .dropDestination(for: String.self) { values, location in
            guard values.count == 1, let value = values.first,
                  value.hasPrefix(CourseCalendar.dragPrefix) else { return false }
            let id = String(value.dropFirst(CourseCalendar.dragPrefix.count))
            return move(id, CourseCalendar.time(on: day, minute: Double(location.y / hourHeight) * 60))
        } isTargeted: { isDropTarget = $0 }
        .clipped()
    }
}

private struct CalendarCurrentTimeLine: View {
    var day: Date
    var width: CGFloat
    var hourHeight: CGFloat

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            ZStack(alignment: .topLeading) {
                if Calendar.current.isDate(day, inSameDayAs: context.date) {
                    HStack(spacing: 0) {
                        Circle().fill(.tint).frame(width: 6, height: 6)
                        Rectangle().fill(.tint).frame(height: 1.5)
                    }
                    .frame(width: width, height: 6)
                    .position(x: width / 2, y: CGFloat(CourseCalendar.minute(of: context.date)) / 60 * hourHeight)
                }
            }.frame(width: width, height: hourHeight * 24, alignment: .topLeading)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// One hit region per day replaces 24 separate gesture/context-menu containers.
/// Pointer tracking changes only this lightweight layer, not the course cards or grid.
private struct TimelineTimeSlots: View {
    var day: Date
    var hourHeight: CGFloat
    var create: (Date) -> Void
    @State private var selectedMinute = 9 * 60

    var body: some View {
        Rectangle().fill(Color.clear)
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture(count: 2).onEnded { tap in
                create(CourseCalendar.time(on: day, minute: Double(tap.location.y / hourHeight) * 60))
            })
            .onContinuousHover { phase in
                if case .active(let location) = phase {
                    let minute = min(1425, max(0, Int(location.y / hourHeight * 60 / 15) * 15))
                    if selectedMinute != minute { selectedMinute = minute }
                }
            }
            .contextMenu {
                Button("新建课程…") { create(CourseCalendar.time(on: day, minute: Double(selectedMinute))) }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(LedgerDate.day(day))，课程时间轴")
            .accessibilityValue(LedgerDate.time(CourseCalendar.time(on: day, minute: Double(selectedMinute))))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: selectedMinute = min(1425, selectedMinute + 15)
                case .decrement: selectedMinute = max(0, selectedMinute - 15)
                @unknown default: break
                }
            }
            .accessibilityAction(named: "新建课程") {
                create(CourseCalendar.time(on: day, minute: Double(selectedMinute)))
            }
    }
}
