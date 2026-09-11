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
                            TimelineCourseGrid(
                                days: displayedDays, index: index, columnWidth: columnWidth,
                                hourHeight: hourHeight, today: today, isActive: isActive,
                                create: create, move: move, edit: edit,
                                confirm: confirm, cancel: cancel, remove: remove
                            )
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

private struct TimelineCourseGrid: View {
    var days: [Date]
    var index: CalendarLessonIndex
    var columnWidth: CGFloat
    var hourHeight: CGFloat
    var today: Date
    var isActive: Bool
    var create: (Date) -> Void
    var move: (String, Date) -> Bool
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void
    @State private var drag: CardDrag?
    @State private var pendingMoves = TimelinePendingMoves()
    @GestureState private var gestureActive = false
    @Namespace private var coordinateSpace

    private struct CardDrag {
        var lesson: Lesson
        var translation: CGSize
        var target: Date?
    }

    private struct Card: Identifiable {
        var entry: CourseCalendar.TimelinePlacement
        var frame: CGRect
        var id: String { entry.id }
    }

    private var width: CGFloat { columnWidth * CGFloat(days.count) }
    private var displayedLessons: [Lesson] {
        pendingMoves.applying(to: days.flatMap { index.days[$0] ?? [] }, revision: index.revision)
    }

    private func card(for entry: CourseCalendar.TimelinePlacement, dayIndex: Int) -> Card {
        Card(entry: entry, frame: TimelineDragPlacement.frame(for: entry, dayIndex: dayIndex,
            columnWidth: columnWidth, hourHeight: hourHeight))
    }

    private var cards: [Card] {
        let displayed = displayedLessons
        return days.enumerated().flatMap { dayIndex, day in
            let entries = pendingMoves.hasMoves(for: index.revision)
                ? CourseCalendar.timeline(displayed, on: day) : index.timeline(on: day)
            return entries.map { card(for: $0, dayIndex: dayIndex) }
        }
    }

    private var dropPreview: Card? {
        guard let drag, let target = drag.target,
              let dayIndex = days.firstIndex(where: { Calendar.current.isDate($0, inSameDayAs: target) }),
              let moved = try? CourseCalendar.moving(drag.lesson, startingAt: target) else { return nil }
        let projected = displayedLessons.filter { $0.id != moved.id } + [moved]
        guard let entry = CourseCalendar.timeline(projected, on: days[dayIndex]).first(where: { $0.id == moved.id }) else { return nil }
        return card(for: entry, dayIndex: dayIndex)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 0) {
                ForEach(days, id: \.self) { day in
                    TimelineDayBackground(day: day, width: columnWidth, hourHeight: hourHeight,
                                          isToday: day == today, isActive: isActive, create: create)
                }
            }
            if let preview = dropPreview {
                RoundedRectangle(cornerRadius: 4)
                    .fill(.tint.opacity(0.14))
                    .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(.tint, lineWidth: 2) }
                    .overlay(alignment: .topLeading) {
                        Text(preview.entry.lesson.timeText)
                            .font(.system(size: 10, weight: .semibold)).monospacedDigit()
                            .padding(.horizontal, 4).padding(.vertical, 2)
                            .foregroundStyle(.white).background(.tint, in: RoundedRectangle(cornerRadius: 3))
                            .offset(y: -18)
                    }
                    .frame(width: preview.frame.width, height: preview.frame.height)
                    .offset(x: preview.frame.minX, y: preview.frame.minY)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .zIndex(2)
            }
            // One stable view per course across every day column. Moving across a
            // day boundary never removes the source view or creates a drag copy.
            ForEach(cards) { card in
                let translation = drag?.lesson.id == card.id ? drag!.translation : .zero
                CalendarLessonItem(
                    lesson: card.entry.lesson, edit: edit, confirm: confirm, cancel: cancel, remove: remove,
                    isTimeline: true, showsTime: card.frame.height >= 42
                )
                .frame(width: card.frame.width, height: card.frame.height)
                .offset(x: card.frame.minX + translation.width, y: card.frame.minY + translation.height)
                .zIndex(drag?.lesson.id == card.id ? 1 : 0)
                .highPriorityGesture(
                    DragGesture(minimumDistance: 4, coordinateSpace: .named(coordinateSpace))
                        .updating($gestureActive) { _, active, _ in active = true }
                        .onChanged { value in
                            guard isActive, card.entry.lesson.status.isOpen else { return }
                            let lesson = drag?.lesson ?? card.entry.lesson
                            let target = TimelineDragPlacement.destination(for: lesson, translation: value.translation,
                                pointer: value.location, days: days, columnWidth: columnWidth, hourHeight: hourHeight)
                            drag = CardDrag(lesson: lesson, translation: value.translation, target: target)
                        }
                        .onEnded { value in finishDrag(value) },
                    including: isActive && card.entry.lesson.status.isOpen ? .all : .subviews
                )
            }
        }
        .frame(width: width, height: hourHeight * 24)
        .coordinateSpace(name: coordinateSpace)
        .transaction { $0.animation = nil }
        .onChange(of: gestureActive) { _, active in if !active { drag = nil } }
        .onChange(of: days) { _, _ in drag = nil }
        .onChange(of: isActive) { _, active in if !active { drag = nil } }
        .onDisappear { drag = nil }
    }

    private func finishDrag(_ value: DragGesture.Value) {
        defer { drag = nil }
        guard isActive, let drag,
              let target = TimelineDragPlacement.destination(for: drag.lesson, translation: value.translation,
                    pointer: value.location, days: days, columnWidth: columnWidth, hourHeight: hourHeight),
              let moved = try? CourseCalendar.moving(drag.lesson, startingAt: target) else { return }
        guard moved.start != drag.lesson.start, move(moved.id, moved.start) else { return }
        // The store writes synchronously, while the shared search/calendar index
        // rebuilds asynchronously. Keep the committed position until it catches up.
        pendingMoves.record(moved, revision: index.revision)
    }
}

private struct TimelineDayBackground: View {
    var day: Date
    var width: CGFloat
    var hourHeight: CGFloat
    var isToday: Bool
    var isActive: Bool
    var create: (Date) -> Void

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
        }
        .frame(width: width, height: hourHeight * 24)
        .background(Calendar.current.isDateInWeekend(day) ? Color.primary.opacity(0.02) : Color.clear)
        .overlay(alignment: .topLeading) {
            if isToday && isActive {
                CalendarCurrentTimeLine(day: day, width: width, hourHeight: hourHeight)
            }
        }
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
    @State private var clipboardOwner = UUID()
    @ObservedObject private var clipboard = CalendarClipboard.shared
    private var pasteTarget: CalendarPasteTarget {
        .time(CourseCalendar.time(on: day, minute: Double(selectedMinute)))
    }

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
                    clipboard.hover(owner: clipboardOwner,
                                    target: .time(CourseCalendar.time(on: day, minute: Double(minute))))
                } else {
                    clipboard.leave(owner: clipboardOwner)
                }
            }
            .onDisappear { clipboard.leave(owner: clipboardOwner) }
            .contextMenu {
                Button("新建课程…") { create(CourseCalendar.time(on: day, minute: Double(selectedMinute))) }
                Button("粘贴课程") { clipboard.paste(at: pasteTarget) }.disabled(!clipboard.canPaste)
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
