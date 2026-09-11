import SwiftUI
import AppKit

struct CalendarYearView: View {
    var date: Date
    @Binding var visibleYear: Date
    var isActive: Bool
    var navigation: CalendarNavigation?
    var calendarRevision: Int
    var index: CalendarLessonIndex
    var today: Date
    var theme: ThemeColor
    var openMonth: (Date) -> Void
    var openDay: (Date) -> Void
    var create: (Date) -> Void

    var body: some View {
        NativeYearScroller(date: date, visibleYear: $visibleYear, isActive: isActive, navigation: navigation,
                           calendarRevision: calendarRevision, index: index, today: today, theme: theme,
                           openMonth: openMonth, openDay: openDay, create: create)
            .padding(.horizontal, 24)
    }
}

struct CalendarYearBand: Equatable {
    var year: Date
    var months: [Date]
    var columns: Int
    var first: Bool
    var offset: CGFloat
    var height: CGFloat
    var contentTop: CGFloat { first ? 44 : 0 }
    static let monthHeight: CGFloat = 232
    static let gap: CGFloat = 28

    static func build(years: [Date], width: CGFloat, calendar: Calendar = .current) -> [Self] {
        let columns = max(1, Int((width + gap) / (210 + gap)))
        var result: [Self] = []
        var offset: CGFloat = 0
        for year in years {
            let months = CalendarDateCache.shared.yearMonths(containing: year, calendar: calendar)
            for start in stride(from: 0, to: months.count, by: columns) {
                let end = min(start + columns, months.count)
                let first = start == 0
                let height = monthHeight + (first ? 44 : 0) + (end == months.count ? 32 : gap)
                result.append(Self(year: year, months: Array(months[start..<end]), columns: columns,
                                   first: first, offset: offset, height: height))
                offset += height
            }
        }
        return result
    }
}

private final class CalendarYearScrollView: NSScrollView {
    var viewportDidLayout: (() -> Void)?

    override func layout() {
        super.layout()
        // The first representable update can precede a usable clip-view size.
        // Initialize after layout even when no bounds-change notification is sent.
        viewportDidLayout?()
    }
}

private struct NativeYearScroller: NSViewRepresentable {
    var date: Date
    @Binding var visibleYear: Date
    var isActive: Bool
    var navigation: CalendarNavigation?
    var calendarRevision: Int
    var index: CalendarLessonIndex
    var today: Date
    var theme: ThemeColor
    var openMonth: (Date) -> Void
    var openDay: (Date) -> Void
    var create: (Date) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = CalendarYearScrollView()
        scroll.borderType = .noBorder; scroll.drawsBackground = false
        scroll.hasVerticalScroller = true; scroll.hasHorizontalScroller = false; scroll.autohidesScrollers = true
        let table = NSTableView()
        table.headerView = nil; table.style = .plain; table.backgroundColor = .clear
        table.selectionHighlightStyle = .none; table.intercellSpacing = .zero; table.gridStyleMask = []
        table.usesAutomaticRowHeights = false
        table.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("year-band"))
        column.minWidth = 0; column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        scroll.documentView = table
        context.coordinator.attach(scroll, table: table)
        return scroll
    }
    func updateNSView(_ nsView: NSScrollView, context: Context) { context.coordinator.update(self) }
    static func dismantleNSView(_ nsView: NSScrollView, coordinator: Coordinator) { coordinator.stop() }

    @MainActor final class Coordinator: NSObject, NSTableViewDataSource, NSTableViewDelegate {
        private var parent: NativeYearScroller
        private weak var scroll: NSScrollView?
        private weak var table: NSTableView?
        private var observer: NSObjectProtocol?
        private var years: [Date] = []
        private var rows: [CalendarYearBand] = []
        private var width: CGFloat = 0
        private var pendingDate: Date?
        private var navigationID: UUID?
        private var lastRow: Int?
        private var reportedYear: Date?
        private var inputs: CalendarYearCell.Inputs?
        private var updating = false
        private var positioning = false
        private var active = true
        private let calendar = Calendar.current
        private let reuseID = NSUserInterfaceItemIdentifier("year-band-cell")

        init(parent: NativeYearScroller) {
            self.parent = parent; pendingDate = parent.date; navigationID = parent.navigation?.id
            super.init()
        }
        func attach(_ scroll: CalendarYearScrollView, table: NSTableView) {
            self.scroll = scroll; self.table = table
            table.dataSource = self; table.delegate = self
            scroll.viewportDidLayout = { [weak self] in self?.viewportChanged() }
            scroll.contentView.postsBoundsChangedNotifications = true
            observer = NotificationCenter.default.addObserver(forName: NSView.boundsDidChangeNotification, object: scroll.contentView, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.viewportChanged() }
            }
        }
        func numberOfRows(in tableView: NSTableView) -> Int { rows.count }
        func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
            rows.indices.contains(row) ? rows[row].height : CalendarYearBand.monthHeight + CalendarYearBand.gap
        }
        func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool { false }
        func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
            guard !positioning, rows.indices.contains(row) else { return nil }
            let cell = tableView.makeView(withIdentifier: reuseID, owner: nil) as? CalendarYearCell ?? CalendarYearCell(frame: .zero)
            cell.identifier = reuseID
            configure(cell, row: row)
            return cell
        }
        func update(_ parent: NativeYearScroller) {
            let wasActive = self.parent.isActive
            self.parent = parent
            guard parent.isActive else { return }
            if navigationID != parent.navigation?.id {
                navigationID = parent.navigation?.id; pendingDate = parent.navigation?.date
            } else if !wasActive, calendar.dateInterval(of: .year, for: parent.date)!.start != reportedYear {
                pendingDate = parent.date
            }
            let next = currentInputs
            let changed = inputs != nil && inputs != next
            inputs = next
            viewportChanged()
            if changed { refreshCells() }
        }
        private var currentInputs: CalendarYearCell.Inputs {
            .init(selectedDate: calendar.startOfDay(for: parent.date), today: parent.today, theme: parent.theme,
                  revision: parent.index.revision)
        }
        private func configure(_ cell: CalendarYearCell, row: Int) {
            cell.configure(band: rows[row], width: width, inputs: currentInputs, index: parent.index,
                           openMonth: parent.openMonth, openDay: parent.openDay, create: parent.create)
        }
        func stop() {
            active = false
            (scroll as? CalendarYearScrollView)?.viewportDidLayout = nil
            if let observer { NotificationCenter.default.removeObserver(observer) }
            observer = nil; table?.dataSource = nil; table?.delegate = nil
        }
        private func viewportChanged() {
            guard active, parent.isActive, !updating, let scroll, table != nil else { return }
            let bounds = scroll.contentView.bounds
            guard bounds.width > 0, bounds.height > 0 else { return }
            updating = true
            defer { updating = false }
            let resized = abs(width - bounds.width) > 0.5
            if let target = pendingDate {
                width = bounds.width
                let year = calendar.dateInterval(of: .year, for: target)!.start
                if !years.contains(year) { years = (-3...3).compactMap { calendar.date(byAdding: .year, value: $0, to: year) } }
                rows = CalendarYearBand.build(years: years, width: width, calendar: calendar)
                reload(at: rows.first(where: { $0.year == year })?.offset ?? 0)
                pendingDate = nil
            } else if resized {
                let old = rows.first(where: { $0.offset + $0.height > bounds.minY })
                let anchor = old?.months.first
                let fraction = old.map { max(0, (bounds.minY - $0.offset) / $0.height) } ?? 0
                width = bounds.width
                rows = CalendarYearBand.build(years: years, width: width, calendar: calendar)
                let next = rows.first(where: { anchor.map($0.months.contains) ?? false })
                reload(at: (next?.offset ?? 0) + fraction * (next?.height ?? 0))
            }
            guard !rows.isEmpty else { return }
            let row = rowIndex(at: scroll.contentView.bounds.minY)
            guard lastRow != row else { return }
            lastRow = row
            let band = rows[row]
            report(band.year)
            guard let yearIndex = years.firstIndex(of: band.year) else { return }
            if yearIndex <= 1, let first = years.first {
                let anchor = band.months[0]
                let extra = scroll.contentView.bounds.minY - band.offset
                years.insert(contentsOf: (-3..<0).compactMap { calendar.date(byAdding: .year, value: $0, to: first) }, at: 0)
                rows = CalendarYearBand.build(years: years, width: width, calendar: calendar)
                let newRow = rows.firstIndex(where: { $0.months.contains(anchor) })!
                reload(at: rows[newRow].offset + extra)
                lastRow = newRow
            } else if yearIndex >= years.count - 2, let last = years.last {
                let offset = scroll.contentView.bounds.minY
                years.append(contentsOf: (1...3).compactMap { calendar.date(byAdding: .year, value: $0, to: last) })
                rows = CalendarYearBand.build(years: years, width: width, calendar: calendar)
                reload(at: offset)
                lastRow = row
            }
        }
        private func rowIndex(at y: CGFloat) -> Int {
            var low = 0, high = rows.count
            while low < high {
                let mid = (low + high) / 2
                if rows[mid].offset + rows[mid].height <= y { low = mid + 1 } else { high = mid }
            }
            return min(low, rows.count - 1)
        }
        private func reload(at offset: CGFloat) {
            guard let table, let scroll else { return }
            positioning = true
            table.tableColumns.first?.width = width
            table.reloadData()
            table.noteHeightOfRows(withIndexesChanged: IndexSet(integersIn: 0..<rows.count))
            let height = rows.last.map { $0.offset + $0.height } ?? 0
            table.setFrameSize(NSSize(width: width, height: height))
            scroll.contentView.scroll(to: NSPoint(x: 0, y: min(max(0, offset), max(0, height - scroll.contentView.bounds.height))))
            scroll.reflectScrolledClipView(scroll.contentView)
            positioning = false; lastRow = nil
            let range = table.rows(in: table.visibleRect)
            if range.location != NSNotFound, range.length > 0 {
                table.reloadData(forRowIndexes: IndexSet(integersIn: range.location..<min(NSMaxRange(range), rows.count)), columnIndexes: IndexSet(integer: 0))
            }
        }
        private func refreshCells() {
            guard let table else { return }
            let range = table.rows(in: table.visibleRect)
            guard range.location != NSNotFound, range.length > 0 else { return }
            for row in range.location..<min(NSMaxRange(range), rows.count) {
                if let cell = table.view(atColumn: 0, row: row, makeIfNecessary: false) as? CalendarYearCell { configure(cell, row: row) }
            }
        }
        private func report(_ year: Date) {
            guard reportedYear != year else { return }
            reportedYear = year
            DispatchQueue.main.async { [weak self] in
                guard let self, self.active, self.parent.isActive, self.reportedYear == year else { return }
                if self.parent.visibleYear != year { self.parent.visibleYear = year }
            }
        }
    }
}

private final class CalendarYearCell: NSTableCellView {
    struct Inputs: Equatable {
        // Lunar-cache completions don't alter this view's solar dates; don't redraw for them.
        var selectedDate: Date; var today: Date; var theme: ThemeColor; var revision: UUID
    }
    private struct Day {
        var info: CourseCalendar.DayPresentation; var rect: NSRect; var count: Int
    }
    private struct Month {
        var date: Date; var title: String; var rect: NSRect; var titleRect: NSRect; var days: [Day]
    }
    private enum Hit: Equatable { case month(Int), day(Int, Int) }
    private var band: CalendarYearBand?
    private var inputs: Inputs?
    private var width: CGFloat = 0
    private var months: [Month] = []
    private var openMonth: ((Date) -> Void)?
    private var openDay: ((Date) -> Void)?
    private var create: ((Date) -> Void)?
    private var pressed: Hit?
    private var tracking: NSTrackingArea?
    private var accessibilityItems: [CalendarCellAccessibilityElement]?
    override var isFlipped: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true; layerContentsRedrawPolicy = .onSetNeedsDisplay
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(band: CalendarYearBand, width: CGFloat, inputs: Inputs, index: CalendarLessonIndex,
                   openMonth: @escaping (Date) -> Void, openDay: @escaping (Date) -> Void, create: @escaping (Date) -> Void) {
        self.openMonth = openMonth; self.openDay = openDay; self.create = create
        guard self.band != band || self.width != width || self.inputs != inputs else { return }
        self.band = band; self.width = width; self.inputs = inputs
        pressed = nil; accessibilityItems = nil; toolTip = nil
        let monthWidth = max(1, (width - CGFloat(band.columns - 1) * CalendarYearBand.gap) / CGFloat(band.columns))
        months = band.months.enumerated().map { column, month in
            let data = CourseCalendar.monthPresentation(for: month)
            let rect = NSRect(x: CGFloat(column) * (monthWidth + CalendarYearBand.gap), y: band.contentTop, width: monthWidth, height: CalendarYearBand.monthHeight)
            let dayWidth = monthWidth / 7
            let days = data.days.enumerated().compactMap { offset, info -> Day? in
                guard info.month == month else { return nil }
                let frame = NSRect(x: rect.minX + CGFloat(offset % 7) * dayWidth, y: rect.minY + 55 + CGFloat(offset / 7) * 29, width: dayWidth, height: 26)
                return Day(info: info, rect: frame, count: index.days[info.date]?.count ?? 0)
            }
            return Month(date: month, title: data.title, rect: rect,
                         titleRect: NSRect(x: rect.minX, y: rect.minY, width: monthWidth, height: 26), days: days)
        }
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let band, let inputs else { return }
        let accent = inputs.theme.nativePrimary
        if band.first {
            text("\(Calendar.current.component(.year, from: band.year))年", rect: NSRect(x: 0, y: 0, width: width, height: 28), font: .systemFont(ofSize: 23, weight: .semibold), color: .labelColor)
        }
        for month in months where month.rect.intersects(dirtyRect) {
            text(month.title, rect: month.titleRect, font: .systemFont(ofSize: 19, weight: .semibold), color: accent)
            for weekday in 0..<7 {
                text(["日", "一", "二", "三", "四", "五", "六"][weekday],
                     rect: NSRect(x: month.rect.minX + CGFloat(weekday) * month.rect.width / 7, y: month.rect.minY + 36, width: month.rect.width / 7, height: 13),
                     font: .systemFont(ofSize: 10), color: .secondaryLabelColor, alignment: .center)
            }
            for day in month.days {
                let today = day.info.date == inputs.today
                let selected = day.info.date == inputs.selectedDate
                let circle = NSRect(x: day.rect.midX - 12, y: day.rect.minY + 1, width: 24, height: 24)
                if today || selected {
                    (today ? NSColor.systemRed : accent.withAlphaComponent(0.1)).setFill()
                    NSBezierPath(ovalIn: circle).fill()
                }
                text("\(day.info.number)", rect: day.rect.insetBy(dx: 0, dy: 4), font: .systemFont(ofSize: 12, weight: today ? .semibold : .regular),
                     color: today ? .white : (day.info.isWeekend ? .secondaryLabelColor : .labelColor), alignment: .center)
                if day.count > 0 {
                    (today ? NSColor.white : accent).setFill()
                    NSBezierPath(ovalIn: NSRect(x: day.rect.midX - 1.5, y: day.rect.maxY - 3, width: 3, height: 3)).fill()
                }
            }
        }
    }
    private func text(_ value: String, rect: NSRect, font: NSFont, color: NSColor, alignment: NSTextAlignment = .left) {
        let style = NSMutableParagraphStyle(); style.alignment = alignment; style.lineBreakMode = .byTruncatingTail
        (value as NSString).draw(in: rect, withAttributes: [.font: font, .foregroundColor: color, .paragraphStyle: style])
    }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }
    private func hit(at point: NSPoint) -> Hit? {
        for (m, month) in months.enumerated() {
            if month.titleRect.contains(point) { return .month(m) }
            if let d = month.days.firstIndex(where: { $0.rect.contains(point) }) { return .day(m, d) }
        }
        return nil
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
    }
    override func mouseMoved(with event: NSEvent) {
        let value: String?
        switch hit(at: convert(event.locationInWindow, from: nil)) {
        case .month(let m): value = "查看\(LedgerDate.month(months[m].date))"
        case .day(let m, let d):
            let day = months[m].days[d]
            value = "\(day.info.accessibility)，\(day.count) 节课程"
        default: value = nil
        }
        if toolTip != value { toolTip = value }
    }
    override func mouseExited(with event: NSEvent) { toolTip = nil }
    override func mouseDown(with event: NSEvent) { pressed = hit(at: convert(event.locationInWindow, from: nil)) }
    override func mouseUp(with event: NSEvent) {
        defer { pressed = nil }
        guard let pressed, pressed == hit(at: convert(event.locationInWindow, from: nil)) else { return }
        activate(pressed)
    }
    private func activate(_ hit: Hit) {
        switch hit {
        case .month(let m): openMonth?(months[m].date)
        case .day(let m, let d): openDay?(months[m].days[d].info.date)
        }
    }
    override func menu(for event: NSEvent) -> NSMenu? {
        guard let target = hit(at: convert(event.locationInWindow, from: nil)) else { return nil }
        let menu = NSMenu()
        switch target {
        case .month(let m):
            let date = months[m].date
            menu.addItem(CalendarActionMenuItem(title: "查看月份") { [weak self] in self?.openMonth?(date) })
        case .day(let m, let d):
            let date = months[m].days[d].info.date
            menu.addItem(CalendarActionMenuItem(title: "查看当天课程") { [weak self] in self?.openDay?(date) })
            menu.addItem(CalendarActionMenuItem(title: "新建课程…") { [weak self] in self?.create?(date) })
        }
        return menu
    }
    override func accessibilityChildren() -> [Any]? {
        if let accessibilityItems { return accessibilityItems }
        var items: [CalendarCellAccessibilityElement] = []
        func add(_ hit: Hit, rect: NSRect, label: String) {
            let element = CalendarCellAccessibilityElement()
            element.owner = self; element.localFrame = rect
            element.setAccessibilityElement(true); element.setAccessibilityEnabled(true)
            element.setAccessibilityRole(.button); element.setAccessibilityParent(self); element.setAccessibilityLabel(label)
            element.press = { [weak self] in self?.activate(hit); return self != nil }
            if case .day(let m, let d) = hit {
                let date = months[m].days[d].info.date
                element.setAccessibilityCustomActions([NSAccessibilityCustomAction(name: "新建课程", handler: { [weak self] in self?.create?(date); return self != nil })])
            }
            items.append(element)
        }
        for (m, month) in months.enumerated() {
            add(.month(m), rect: month.titleRect, label: "查看\(LedgerDate.month(month.date))")
            for (d, day) in month.days.enumerated() {
                add(.day(m, d), rect: day.rect, label: "\(day.info.accessibility)，\(day.count) 节课程，查看日视图")
            }
        }
        accessibilityItems = items
        return items
    }
}
