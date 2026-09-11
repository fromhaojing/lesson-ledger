import SwiftUI
import AppKit

/// Presentation only: mutations use the existing ledger actions and state rules.
struct CalendarPanel: View {
    @Binding var date: Date
    @Binding var mode: CalendarDisplayMode
    var lessons: [Lesson]
    var search: String
    var theme: ThemeColor
    var reschedule: (String, Date) -> Bool
    var create: (Date) -> Void
    var createTimed: (Date) -> Void
    var moveToTime: (String, Date) -> Bool
    var pasteCourse: (CalendarCopiedCourse, CalendarPasteTarget) -> Bool
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void
    @State private var visibleMonth = Calendar.current.dateInterval(of: .month, for: Date())!.start
    @State private var visibleYear = Calendar.current.dateInterval(of: .year, for: Date())!.start
    @State private var navigation: CalendarNavigation?
    @State private var index = CalendarLessonIndex()
    @State private var indexRequestID = UUID()
    @State private var today = Calendar.current.startOfDay(for: Date())
    @State private var mountedModes: Set<CalendarDisplayMode> = []
    @State private var calendarRevision = 0
    private var calendar: Calendar { .current }

    var body: some View {
        VStack(spacing: 0) {
            header
            ZStack {
                ForEach(CalendarDisplayMode.allCases) { target in
                    if target == mode || mountedModes.contains(target) {
                        CalendarRetainedLayer(
                            isActive: target == mode,
                            inputs: CalendarLayerInputs(date: date, month: visibleMonth, year: visibleYear, today: today,
                                                        theme: theme, revision: index.revision, navigation: navigation?.id,
                                                        calendarRevision: calendarRevision),
                            content: calendarContent(target)
                        )
                        .equatable()
                        .opacity(target == mode ? 1 : 0)
                        .allowsHitTesting(target == mode)
                        .accessibilityHidden(target != mode)
                        .zIndex(target == mode ? 1 : 0)
                    }
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
            footer
        }
        .background(Color(nsColor: .controlBackgroundColor))
        .background(CalendarClipboardHost().frame(width: 0, height: 0))
        .onAppear { CalendarClipboard.shared.activate(fallback: .day(date), paste: pasteCourse) }
        .onDisappear { CalendarClipboard.shared.deactivate() }
        .onChange(of: lessons) { _, next in
            indexRequestID = UUID()
            CalendarClipboard.shared.refresh(next)
        }
        .onChange(of: search) { _, _ in indexRequestID = UUID() }
        .task(id: indexRequestID) { await rebuildIndex() }
        .onChange(of: mode, initial: true) { previous, next in
            CalendarClipboard.shared.clearHover()
            mountedModes.insert(next)
            if previous == .month, next != .month,
               !calendar.isDate(date, equalTo: visibleMonth, toGranularity: .month) {
                date = visibleMonth
            }
            if previous == .year, next != .year,
               !calendar.isDate(date, equalTo: visibleYear, toGranularity: .year) {
                date = visibleYear
            }
            prefetchCalendarDates()
        }
        .onChange(of: visibleMonth, initial: true) { _, _ in
            if mode == .month { prefetchCalendarDates() }
        }
        .onChange(of: visibleYear) { _, _ in
            if mode == .year { prefetchCalendarDates() }
        }
        .onChange(of: date) { _, _ in
            CalendarClipboard.shared.updateFallback(.day(date))
            if mode != .month { prefetchCalendarDates() }
        }
        .onReceive(NotificationCenter.default.publisher(for: CalendarDateCache.didLoadMonths)) { notification in
            guard let changes = notification.object as? Set<CalendarDateCache.Change> else { return }
            let signature = CalendarDateCache.shared.configurationID(calendar: calendar)
            let range = displayedDateRange
            if changes.contains(where: { $0.configuration == signature && $0.start < range.end && $0.end > range.start }) {
                calendarRevision &+= 1
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: CalendarDateCache.didChangeConfiguration)) { _ in
            today = calendar.startOfDay(for: Date())
            visibleMonth = calendar.dateInterval(of: .month, for: date)!.start
            visibleYear = calendar.dateInterval(of: .year, for: date)!.start
            calendarRevision &+= 1
            indexRequestID = UUID()
            prefetchCalendarDates()
        }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in
            today = calendar.startOfDay(for: Date())
        }
    }

    @ViewBuilder private func calendarContent(_ target: CalendarDisplayMode) -> some View {
        switch target {
        case .month: monthView
        case .day, .week:
            CalendarTimelineView(
                date: date, showsWeek: target == .week, isActive: target == mode, calendarRevision: calendarRevision,
                index: index, today: today,
                create: createTimed, move: moveToTime, openDay: { show(.day, on: $0) },
                edit: edit, confirm: confirm, cancel: cancel, remove: remove
            )
        case .year:
            CalendarYearView(
                date: date, visibleYear: $visibleYear, isActive: mode == .year, navigation: navigation,
                calendarRevision: calendarRevision, index: index, today: today, theme: theme,
                openMonth: { show(.month, on: $0) }, openDay: { show(.day, on: $0) }, create: create
            )
            .id(CalendarDateCache.shared.configurationID(calendar: calendar))
        }
    }

    private var monthView: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(0..<7) { column in
                    Text(["周日", "周一", "周二", "周三", "周四", "周五", "周六"][column])
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(column == 0 || column == 6 ? .secondary : .primary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                }
            }.padding(.horizontal, 24)
            Divider().padding(.horizontal, 24)
            CalendarWeekScroller(
                date: $date, visibleMonth: $visibleMonth, isActive: mode == .month, navigation: navigation,
                index: index, today: today, theme: theme, calendarRevision: calendarRevision, reschedule: reschedule,
                create: create, edit: edit, confirm: confirm, cancel: cancel, remove: remove
            )
            .id(CalendarDateCache.shared.configurationID(calendar: calendar))
            .padding(.horizontal, 24)
        }
    }

    private func prefetchCalendarDates() {
        let target = mode == .month ? visibleMonth : (mode == .year ? visibleYear : date)
        CalendarDateCache.shared.prefetch(around: target,
                                         wholeYear: mode == .year, calendar: calendar)
    }

    private var displayedDateRange: DateInterval {
        switch mode {
        case .year:
            return DateInterval(start: calendar.date(byAdding: .year, value: -1, to: visibleYear)!,
                                end: calendar.date(byAdding: .year, value: 2, to: visibleYear)!)
        case .day: return calendar.dateInterval(of: .day, for: date)!
        case .week:
            let start = CourseCalendar.weekStart(for: date, calendar: calendar)
            return DateInterval(start: start, end: calendar.date(byAdding: .day, value: 7, to: start)!)
        case .month:
            let start = calendar.date(byAdding: .month, value: -1, to: visibleMonth)!
            let end = calendar.date(byAdding: .month, value: 3, to: visibleMonth)!
            return DateInterval(start: start, end: end)
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            Text(heading).font(.system(size: mode == .week ? 26 : 32, weight: .bold))
                .lineLimit(1).minimumScaleFactor(0.7)
            Spacer()
            HStack(spacing: 2) {
                Button { changePeriod(-1) } label: { Image(systemName: "chevron.left").frame(width: 22, height: 22) }
                    .help(mode.previousTitle).accessibilityLabel(mode.previousTitle)
                Button("今天") { navigate(to: Date()) }.padding(.horizontal, 6)
                Button { changePeriod(1) } label: { Image(systemName: "chevron.right").frame(width: 22, height: 22) }
                    .help(mode.nextTitle).accessibilityLabel(mode.nextTitle)
            }.buttonStyle(.borderless)
                .padding(4).background(Color.primary.opacity(0.045), in: Capsule())
        }.padding(.horizontal, 24).padding(.vertical, 20)
    }

    private var heading: String {
        switch mode {
        case .month: return LedgerDate.month(visibleMonth)
        case .year: return "\(calendar.component(.year, from: visibleYear))年"
        case .day: return "\(LedgerDate.month(date))\(calendar.component(.day, from: date))日"
        case .week:
            let start = CourseCalendar.weekStart(for: date, calendar: calendar)
            let end = calendar.date(byAdding: .day, value: 6, to: start)!
            let first = "\(LedgerDate.month(start))\(calendar.component(.day, from: start))日"
            let last = calendar.isDate(start, equalTo: end, toGranularity: .month)
                ? "\(calendar.component(.day, from: end))日"
                : "\(LedgerDate.month(end))\(calendar.component(.day, from: end))日"
            return "\(first) – \(last)"
        }
    }

    private var footer: some View {
        let count = periodCount
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 16) {
                Text("\(mode.periodTitle)\(search.isEmpty ? " " : "匹配 ")\(count) 节课程")
                ForEach(LessonStatus.allCases) { StatusLabel(status: $0) }
                Spacer(minLength: 8)
            }
            HStack {
                Text("\(mode.periodTitle)\(search.isEmpty ? " " : "匹配 ")\(count) 节课程")
                Spacer()
            }
        }.font(.caption).foregroundStyle(.secondary).padding(.horizontal, 24).padding(.vertical, 10)
    }

    private var periodCount: Int {
        switch mode {
        case .day: return index.days[calendar.startOfDay(for: date)]?.count ?? 0
        case .week:
            let start = CourseCalendar.weekStart(for: date, calendar: calendar)
            return (0..<7).reduce(0) { $0 + (index.days[calendar.date(byAdding: .day, value: $1, to: start)!]?.count ?? 0) }
        case .month:
            return index.monthCounts[calendar.dateInterval(of: .month, for: visibleMonth)!.start] ?? 0
        case .year:
            return index.yearCounts[visibleYear] ?? 0
        }
    }

    private func changePeriod(_ offset: Int) {
        let anchor = mode == .month ? calendar.dateInterval(of: .month, for: visibleMonth)!.start : (mode == .year ? visibleYear : date)
        navigate(to: calendar.date(byAdding: mode.component, value: offset, to: anchor)!)
    }

    private func navigate(to target: Date) {
        date = target
        visibleMonth = calendar.dateInterval(of: .month, for: target)!.start
        visibleYear = calendar.dateInterval(of: .year, for: target)!.start
        navigation = CalendarNavigation(date: target)
    }

    private func show(_ targetMode: CalendarDisplayMode, on target: Date) {
        navigate(to: target)
        mode = targetMode
    }

    private func rebuildIndex() async {
        let requestID = indexRequestID
        let snapshot = lessons
        let query = search
        let calendar = self.calendar
        let worker = Task.detached(priority: .userInitiated) {
            try CalendarLessonSnapshot.build(lessons: snapshot, search: query, calendar: calendar)
        }
        do {
            let data = try await withTaskCancellationHandler {
                try await worker.value
            } onCancel: {
                worker.cancel()
            }
            guard !Task.isCancelled, requestID == indexRequestID else { return }
            index = CalendarLessonIndex(snapshot: data, calendar: calendar)
        } catch is CancellationError {
            // A newer query/data snapshot or leaving the calendar supersedes this result.
        } catch {
            // The builder only throws cancellation; keep the last completed snapshot.
        }
    }
}

private struct CalendarLayerInputs: Equatable {
    var date: Date
    var month: Date
    var year: Date
    var today: Date
    var theme: ThemeColor
    var revision: UUID
    var navigation: UUID?
    var calendarRevision: Int
}

/// Keep the view identity/scroll state, but don't push new data through hidden layers.
private struct CalendarRetainedLayer<Content: View>: View, Equatable {
    var isActive: Bool
    var inputs: CalendarLayerInputs
    var content: Content

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isActive == rhs.isActive && (!rhs.isActive || lhs.inputs == rhs.inputs)
    }

    var body: some View { content }
}

struct CalendarNavigation: Equatable {
    var id = UUID()
    var date: Date
}

struct CalendarLessonIndex {
    let revision = UUID()
    var days: [Date: [Lesson]] = [:]
    var monthCounts: [Date: Int] = [:]
    var yearCounts: [Date: Int] = [:]
    private let timelineCache = CalendarTimelineCache()
    private var calendar: Calendar

    init(snapshot: CalendarLessonSnapshot = CalendarLessonSnapshot(), calendar: Calendar = .current) {
        self.calendar = calendar
        days = snapshot.days
        monthCounts = snapshot.monthCounts
        yearCounts = snapshot.yearCounts
    }

    func timeline(on day: Date) -> [CourseCalendar.TimelinePlacement] {
        if let cached = timelineCache.days[day] { return cached }
        let layout = CourseCalendar.timeline(days[day] ?? [], on: day, calendar: calendar)
        timelineCache.days[day] = layout
        return layout
    }
}

struct CalendarLessonSnapshot: Sendable {
    var days: [Date: [Lesson]] = [:]
    var monthCounts: [Date: Int] = [:]
    var yearCounts: [Date: Int] = [:]

    static func build(lessons: [Lesson], search: String, calendar: Calendar) throws -> Self {
        var result = Self()
        for (offset, lesson) in lessons.enumerated() {
            if offset.isMultiple(of: 128) { try Task.checkCancellation() }
            if !search.isEmpty && ![lesson.title, lesson.studentText, lesson.grade, lesson.courseType, lesson.note]
                .contains(where: { $0.localizedCaseInsensitiveContains(search) }) { continue }
            result.days[calendar.startOfDay(for: lesson.start), default: []].append(lesson)
        }
        for (day, courses) in result.days {
            try Task.checkCancellation()
            let month = calendar.dateInterval(of: .month, for: day)!.start
            result.monthCounts[month, default: 0] += courses.count
            let year = calendar.dateInterval(of: .year, for: day)!.start
            result.yearCounts[year, default: 0] += courses.count
        }
        return result
    }
}

private final class CalendarTimelineCache {
    var days: [Date: [CourseCalendar.TimelinePlacement]] = [:]
}

enum CalendarDisplayMode: String, CaseIterable, Identifiable {
    case day = "日", week = "周", month = "月", year = "年"
    var id: String { rawValue }
    var component: Calendar.Component {
        switch self {
        case .day: return .day
        case .week: return .weekOfYear
        case .month: return .month
        case .year: return .year
        }
    }
    var previousTitle: String {
        switch self {
        case .day: return "前一天"
        case .week: return "上一周"
        case .month: return "上个月"
        case .year: return "上一年"
        }
    }
    var nextTitle: String {
        switch self {
        case .day: return "后一天"
        case .week: return "下一周"
        case .month: return "下个月"
        case .year: return "下一年"
        }
    }
    var periodTitle: String { self == .day ? "当天" : "本\(rawValue)" }
}

struct CalendarModeSwitcher: View {
    @Binding var selection: CalendarDisplayMode
    var theme: ThemeColor

    var body: some View {
        HStack(spacing: 2) {
            ForEach(CalendarDisplayMode.allCases) { mode in
                Button { selection = mode } label: {
                    Text(mode.rawValue)
                        .font(.system(size: 13, weight: selection == mode ? .semibold : .regular))
                        .foregroundStyle(selection == mode ? Color.white : Color.black)
                        .frame(width: 46, height: 28)
                        .background {
                            if selection == mode { Capsule().fill(theme.primary) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .help("\(mode.rawValue)视图")
                .accessibilityLabel("\(mode.rawValue)视图")
                .accessibilityAddTraits(selection == mode ? [.isSelected] : [])
            }
        }
        .padding(4)
        .background(Color.white, in: Capsule())
        .overlay { Capsule().strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5) }
        .fixedSize()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("日历视图")
    }
}

/// Fixed row geometry and AppKit's reuse queue mirror the old FlatList/getItemLayout
/// approach. Scrolling never creates or removes hosting views in our bounds callback.
private struct CalendarWeekScroller: NSViewRepresentable {
    @Binding var date: Date
    @Binding var visibleMonth: Date
    var isActive: Bool
    var navigation: CalendarNavigation?
    var index: CalendarLessonIndex
    var today: Date
    var theme: ThemeColor
    var calendarRevision: Int
    var reschedule: (String, Date) -> Bool
    var create: (Date) -> Void
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.borderType = .noBorder
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.hasHorizontalScroller = false
        scroll.autohidesScrollers = true

        let table = NSTableView()
        table.headerView = nil
        table.backgroundColor = .clear
        table.style = .plain
        table.gridStyleMask = []
        table.selectionHighlightStyle = .none
        table.intercellSpacing = .zero
        table.usesAutomaticRowHeights = false
        table.rowHeight = 100
        table.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("calendar-week"))
        column.minWidth = 0
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        scroll.documentView = table
        context.coordinator.attach(scroll: scroll, table: table)
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        context.coordinator.update(parent: self)
    }

    static func dismantleNSView(_ nsView: NSScrollView, coordinator: Coordinator) {
        coordinator.stop()
    }

    private struct RenderInputs: Equatable {
        var selection: Date
        var month: Date
        var today: Date
        var theme: ThemeColor
        var revision: UUID
        var calendarRevision: Int
    }

    @MainActor final class Coordinator: NSObject, NSTableViewDataSource, NSTableViewDelegate {
        private var parent: CalendarWeekScroller
        private weak var scroll: NSScrollView?
        private weak var table: NSTableView?
        private var observer: NSObjectProtocol?
        private var weeks: [Date] = []
        private var rowHeight: CGFloat = 100
        private var viewportWidth: CGFloat = 0
        private var pendingNavigation: Date?
        private var navigationID: UUID?
        private var renderInputs: RenderInputs?
        private var lastReportedMonth: Date?
        private var lastVisibleRow: Int?
        private var updating = false
        private var positioning = false
        private var active = true
        private let calendar = Calendar.current
        private let cellID = NSUserInterfaceItemIdentifier("calendar-week-cell")

        init(parent: CalendarWeekScroller) {
            self.parent = parent
            self.pendingNavigation = parent.date
            self.navigationID = parent.navigation?.id
            super.init()
        }

        func attach(scroll: NSScrollView, table: NSTableView) {
            self.scroll = scroll
            self.table = table
            table.dataSource = self
            table.delegate = self
            scroll.contentView.postsBoundsChangedNotifications = true
            observer = NotificationCenter.default.addObserver(
                forName: NSView.boundsDidChangeNotification, object: scroll.contentView, queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated { self?.viewportChanged() }
            }
        }

        func numberOfRows(in tableView: NSTableView) -> Int { weeks.count }

        func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool { false }

        func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
            guard !positioning, weeks.indices.contains(row) else { return nil }
            let cell = tableView.makeView(withIdentifier: cellID, owner: nil) as? CalendarWeekCell
                ?? CalendarWeekCell(frame: .zero)
            cell.identifier = cellID
            cell.configure(makeRow(weeks[row]))
            return cell
        }

        func update(parent: CalendarWeekScroller) {
            let wasActive = self.parent.isActive
            self.parent = parent
            guard parent.isActive else { return }
            if navigationID != parent.navigation?.id {
                navigationID = parent.navigation?.id
                pendingNavigation = parent.navigation?.date
            } else if !wasActive {
                let targetMonth = calendar.dateInterval(of: .month, for: parent.date)!.start
                if targetMonth != lastReportedMonth { pendingNavigation = parent.date }
            }
            let inputs = RenderInputs(
                selection: calendar.startOfDay(for: parent.date), month: parent.visibleMonth,
                today: parent.today, theme: parent.theme, revision: parent.index.revision,
                calendarRevision: parent.calendarRevision
            )
            let contentChanged = renderInputs != nil && renderInputs != inputs
            renderInputs = inputs
            viewportChanged()
            if contentChanged { refreshVisibleContent() }
        }

        func stop() {
            active = false
            if let observer { NotificationCenter.default.removeObserver(observer) }
            observer = nil
            table?.delegate = nil
            table?.dataSource = nil
        }

        private func viewportChanged() {
            guard active, parent.isActive, !updating, let scroll, let table else { return }
            let bounds = scroll.contentView.bounds
            guard bounds.width > 0, bounds.height > 0 else { return }
            updating = true
            defer { updating = false }

            let resized = abs(viewportWidth - bounds.width) > 0.5
            var offset = bounds.minY
            if resized {
                let fractionalRow = max(0, offset / rowHeight)
                viewportWidth = bounds.width
                rowHeight = max(100, bounds.width / 7 / 1.9)
                table.rowHeight = rowHeight
                table.setFrameSize(NSSize(width: bounds.width, height: table.frame.height))
                table.tableColumns.first?.width = bounds.width
                offset = fractionalRow * rowHeight
            }
            if let target = pendingNavigation {
                let month = calendar.dateInterval(of: .month, for: target)!.start
                let week = CourseCalendar.weekStart(for: month, calendar: calendar)
                let needsReload = !weeks.contains(week)
                if needsReload {
                    weeks = CourseCalendar.weeks(around: week, calendar: calendar)
                }
                offset = CGFloat(weeks.firstIndex(of: week)!) * rowHeight
                pendingNavigation = nil
                lastVisibleRow = nil
                if needsReload { reloadPositioned(at: offset) }
                else { scrollTo(offset) }
            } else if resized {
                lastVisibleRow = nil
                scrollTo(offset)
                refreshVisibleContent()
            }
            guard !weeks.isEmpty else { return }
            let first = min(weeks.count - 1, max(0, Int(floor(scroll.contentView.bounds.minY / rowHeight))))
            // Normal pixel scrolling is only this integer comparison: no Set, row traversal,
            // date formatting, hosting-view allocation, or rootView assignment.
            guard first != lastVisibleRow else { return }
            lastVisibleRow = first
            reportMonth(for: weeks[first])

            if first < 8 {
                let start = weeks[0]
                let preceding = (-52..<0).map { calendar.date(byAdding: .weekOfYear, value: $0, to: start)! }
                let oldOffset = scroll.contentView.bounds.minY
                weeks.insert(contentsOf: preceding, at: 0)
                reloadPositioned(at: oldOffset + CGFloat(preceding.count) * rowHeight)
                lastVisibleRow = first + preceding.count
            } else if first >= weeks.count - 16 {
                let end = weeks[weeks.count - 1]
                let following = (1...52).map { calendar.date(byAdding: .weekOfYear, value: $0, to: end)! }
                let oldOffset = scroll.contentView.bounds.minY
                weeks.append(contentsOf: following)
                table.noteNumberOfRowsChanged()
                scrollTo(oldOffset)
            }
        }

        private func scrollTo(_ y: CGFloat) {
            guard let scroll, let table else { return }
            // Fixed geometry is sufficient to position the clip view; do not force layout
            // of the current (possibly wrong) rows before navigating to the requested month.
            let size = NSSize(width: viewportWidth, height: CGFloat(weeks.count) * rowHeight)
            if table.frame.size != size { table.setFrameSize(size) }
            let limit = max(0, CGFloat(weeks.count) * rowHeight - scroll.contentView.bounds.height)
            scroll.contentView.scroll(to: NSPoint(x: 0, y: min(limit, max(0, y))))
            scroll.reflectScrolledClipView(scroll.contentView)
        }

        private func reloadPositioned(at offset: CGFloat) {
            guard let table else { return }
            // Reload row metadata without building SwiftUI cells at the old scroll offset.
            positioning = true
            table.reloadData()
            scrollTo(offset)
            positioning = false
            // Only the target viewport now gets hosting views, once it is correctly placed.
            let range = table.rows(in: table.visibleRect)
            if range.location != NSNotFound, range.length > 0 {
                let end = min(NSMaxRange(range), weeks.count)
                if range.location < end {
                    table.reloadData(forRowIndexes: IndexSet(integersIn: range.location..<end), columnIndexes: IndexSet(integer: 0))
                }
            }
        }

        private func refreshVisibleContent() {
            guard let table else { return }
            let range = table.rows(in: table.visibleRect)
            guard range.location != NSNotFound, range.length > 0 else { return }
            for row in range.location..<min(NSMaxRange(range), weeks.count) {
                if let cell = table.view(atColumn: 0, row: row, makeIfNecessary: false) as? CalendarWeekCell {
                    cell.configure(makeRow(weeks[row]))
                }
            }
        }

        private func makeRow(_ week: Date) -> CalendarMonthRow {
            CalendarMonthRow(
                week: week, selectedDate: parent.date, month: parent.visibleMonth,
                index: parent.index, today: parent.today, theme: parent.theme, width: viewportWidth, height: rowHeight,
                calendarRevision: parent.calendarRevision,
                select: { [weak self] day in self?.parent.date = day },
                reschedule: parent.reschedule, create: parent.create, edit: parent.edit,
                confirm: parent.confirm, cancel: parent.cancel, remove: parent.remove
            )
        }

        private func reportMonth(for week: Date) {
            let month = CourseCalendar.month(at: week, calendar: calendar)
            guard lastReportedMonth != month else { return }
            lastReportedMonth = month
            DispatchQueue.main.async { [weak self] in
                guard let self, self.active, self.parent.isActive, self.lastReportedMonth == month else { return }
                if self.parent.visibleMonth != month { self.parent.visibleMonth = month }
            }
        }
    }
}

struct CalendarMonthRow {
    var week: Date
    var selectedDate: Date
    var month: Date
    var index: CalendarLessonIndex
    var today: Date
    var theme: ThemeColor
    var width: CGFloat
    var height: CGFloat
    var calendarRevision: Int
    var select: (Date) -> Void
    var reschedule: (String, Date) -> Bool
    var create: (Date) -> Void
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void
}

struct CalendarLessonItem: View {
    var lesson: Lesson
    var edit: (Lesson) -> Void
    var confirm: (Lesson) -> Void
    var cancel: (Lesson) -> Void
    var remove: (Lesson) -> Void
    var isTimeline = false
    var showsTime = true
    @State private var showDetails = false
    @State private var clipboardOwner = UUID()
    @ObservedObject private var clipboard = CalendarClipboard.shared
    private var pasteTarget: CalendarPasteTarget { isTimeline ? .time(lesson.start) : .day(lesson.start) }

    var body: some View {
        Group {
            if lesson.status.isOpen && !isTimeline {
                eventButton.draggable(CourseCalendar.dragPrefix + lesson.id)
            } else { eventButton }
        }
        .onHover { hovered in
            if hovered { clipboard.hover(owner: clipboardOwner, lesson: lesson, target: pasteTarget) }
            else { clipboard.leave(owner: clipboardOwner) }
        }
        .onDisappear { clipboard.leave(owner: clipboardOwner) }
        .popover(isPresented: $showDetails, arrowEdge: .trailing) {
            LessonDetailView(
                lesson: lesson,
                edit: { showDetails = false; edit(lesson) },
                confirm: { showDetails = false; confirm(lesson) },
                cancel: { showDetails = false; cancel(lesson) },
                remove: { showDetails = false; remove(lesson) }
            ).frame(width: 320, height: 540)
        }
        .contextMenu {
            Button("查看课程") { showDetails = true }
            Button("复制课程") { clipboard.copy(lesson) }
            Button("粘贴课程") { clipboard.paste(at: pasteTarget) }.disabled(!clipboard.canPaste)
            if lesson.status.isOpen {
                Button("编辑课程…") { edit(lesson) }
                Button("确认金额…") { confirm(lesson) }
                Button("取消课程…", role: .destructive) { cancel(lesson) }
            }
            Divider()
            Button("删除课程…", role: .destructive) { remove(lesson) }
        }
    }

    private var eventButton: some View {
        Button { clipboard.select(lesson, target: pasteTarget); showDetails = true } label: {
            if isTimeline {
                VStack(alignment: .leading, spacing: 3) {
                    Text(lesson.title).font(.system(size: 12, weight: .medium))
                        .strikethrough(lesson.status == .cancelled).lineLimit(2)
                    if showsTime {
                        Text(lesson.timeText).font(.system(size: 10)).monospacedDigit()
                            .foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .padding(.horizontal, 6).padding(.vertical, showsTime ? 6 : 0)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .foregroundStyle(lesson.status == .cancelled ? .secondary : .primary)
                .background(lesson.status.color.opacity(0.13), in: RoundedRectangle(cornerRadius: 5))
                .clipped().contentShape(Rectangle())
            } else {
            HStack(spacing: 4) {
                Text(lesson.title).fontWeight(.medium).lineLimit(1)
                    .strikethrough(lesson.status == .cancelled)
                Spacer(minLength: 0)
                Text(LedgerDate.time(lesson.start)).font(.system(size: 10)).monospacedDigit().foregroundStyle(.secondary)
            }
            .font(.system(size: 11)).padding(.horizontal, 5).frame(height: 18)
            .foregroundStyle(lesson.status == .cancelled ? .secondary : .primary)
            .background(lesson.status.color.opacity(0.09), in: RoundedRectangle(cornerRadius: 4))
            .contentShape(Rectangle())
            }
        }.buttonStyle(.plain)
            .help("\(lesson.title) · \(lesson.timeText) · \(lesson.status.title)")
            .accessibilityLabel("\(lesson.title)，\(lesson.timeText)，\(lesson.status.title)")
    }
}
