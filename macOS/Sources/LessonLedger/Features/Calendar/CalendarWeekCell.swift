import AppKit
import SwiftUI

/// The scrolling surface is a single cached native layer per week. SwiftUI is instantiated
/// only when opening a detail/agenda popover, never to measure the visible course strips.
final class CalendarWeekCell: NSTableCellView, NSDraggingSource {
    private enum Hit: Equatable {
        case day(Int), more(Int), lesson(Int, Int)
    }
    private struct DayLayout {
        var info: CourseCalendar.DayPresentation
        var rect: NSRect
        var dateRect: NSRect
        var moreRect: NSRect?
        var lessons: [Lesson]
        var eventRects: [NSRect]
    }
    private struct Identity: Equatable {
        var week: Date; var selection: Date; var month: Date; var today: Date
        var revision: UUID; var calendarRevision: Int; var theme: ThemeColor
        var width: CGFloat; var height: CGFloat
    }
    private var content: CalendarMonthRow?
    private var identity: Identity?
    private var days: [DayLayout] = []
    private var axElements: [CalendarCellAccessibilityElement] = []
    private var pressed: Hit?
    private var pressPoint = NSPoint.zero
    private var didDrag = false
    private var dropDay: Int?
    private var popover: NSPopover?
    private var tracking: NSTrackingArea?
    private let clipboardOwner = UUID()
    private let calendar = Calendar.current
    override var isFlipped: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layerContentsRedrawPolicy = .onSetNeedsDisplay
        registerForDraggedTypes([.string])
        setAccessibilityElement(false)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(_ row: CalendarMonthRow) {
        let next = Identity(week: row.week, selection: calendar.startOfDay(for: row.selectedDate), month: row.month,
                            today: row.today, revision: row.index.revision, calendarRevision: row.calendarRevision,
                            theme: row.theme, width: row.width, height: row.height)
        if let identity, identity.week != next.week || identity.revision != next.revision {
            popover?.close(); pressed = nil; dropDay = nil
        }
        content = row
        guard identity != next else { return }
        identity = next
        let columnWidth = row.width / 7
        days = (0..<7).map { column in
            let date = calendar.date(byAdding: .day, value: column, to: row.week)!
            let info = CourseCalendar.presentation(for: date, calendar: calendar)
            let rect = NSRect(x: CGFloat(column) * columnWidth, y: 0, width: columnWidth, height: row.height)
            let dateWidth = max(28, textWidth(info.title, font: .systemFont(ofSize: 16)) + 10)
            let dateRect = NSRect(x: rect.maxX - 8 - dateWidth, y: 6, width: dateWidth, height: 28)
            let lessons = row.index.days[date] ?? []
            let extra = lessons.count - 3
            let moreWidth = textWidth("+\(extra)", font: .systemFont(ofSize: 10, weight: .medium)) + 8
            let more = extra > 0 ? NSRect(x: dateRect.minX - moreWidth - 4, y: 12, width: moreWidth, height: 17) : nil
            let events = (0..<min(3, lessons.count)).map {
                NSRect(x: rect.minX + 4, y: 37 + CGFloat($0) * 20, width: max(1, columnWidth - 8), height: 18)
            }
            return DayLayout(info: info, rect: rect, dateRect: dateRect, moreRect: more, lessons: lessons, eventRects: events)
        }
        rebuildAccessibility()
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let content else { return }
        let accent = content.theme.nativePrimary
        for day in days where day.rect.intersects(dirtyRect) {
            if day.info.isWeekend { NSColor.labelColor.withAlphaComponent(0.025).setFill(); day.rect.fill() }
            if day.info.month != content.month { NSColor.labelColor.withAlphaComponent(0.02).setFill(); day.rect.fill() }
            if day.info.date == identity?.selection { accent.withAlphaComponent(0.045).setFill(); day.rect.fill() }
            if let dropDay, days[dropDay].info.date == day.info.date {
                accent.withAlphaComponent(0.15).setFill(); day.rect.fill()
                accent.setStroke(); let border = NSBezierPath(rect: day.rect.insetBy(dx: 1, dy: 1)); border.lineWidth = 2; border.stroke()
            }
            let lunarRight = day.moreRect?.minX ?? day.dateRect.minX
            drawText(day.info.lunar, rect: NSRect(x: day.rect.minX + 8, y: 13, width: max(0, lunarRight - day.rect.minX - 12), height: 15),
                     font: .systemFont(ofSize: 11), color: .tertiaryLabelColor)
            let today = day.info.date == content.today
            if today { NSColor.systemRed.setFill(); NSBezierPath(roundedRect: day.dateRect, xRadius: 14, yRadius: 14).fill() }
            let dateColor: NSColor = today ? .white : (day.info.month == content.month ? .labelColor : .secondaryLabelColor.withAlphaComponent(0.55))
            drawText(day.info.title, rect: day.dateRect.insetBy(dx: 2, dy: 4), font: .systemFont(ofSize: 16, weight: today ? .semibold : .regular), color: dateColor, alignment: .center)
            if let more = day.moreRect {
                NSColor.labelColor.withAlphaComponent(0.06).setFill(); NSBezierPath(roundedRect: more, xRadius: 8, yRadius: 8).fill()
                drawText("+\(day.lessons.count - 3)", rect: more.insetBy(dx: 2, dy: 1), font: .systemFont(ofSize: 10, weight: .medium), color: .secondaryLabelColor, alignment: .center)
            }
            for (index, rect) in day.eventRects.enumerated() {
                let lesson = day.lessons[index]
                let color = statusColor(lesson.status)
                color.withAlphaComponent(0.09).setFill(); NSBezierPath(roundedRect: rect, xRadius: 4, yRadius: 4).fill()
                let time = LedgerDate.time(lesson.start)
                let timeFont = NSFont.monospacedDigitSystemFont(ofSize: 10, weight: .regular)
                let timeWidth = textWidth(time, font: timeFont)
                drawText(time, rect: NSRect(x: rect.maxX - timeWidth - 5, y: rect.minY + 2, width: timeWidth, height: 14), font: timeFont, color: .secondaryLabelColor)
                drawText(lesson.title, rect: NSRect(x: rect.minX + 5, y: rect.minY + 1, width: max(0, rect.width - timeWidth - 15), height: 16),
                         font: .systemFont(ofSize: 11, weight: .medium), color: lesson.status == .cancelled ? .secondaryLabelColor : .labelColor,
                         strike: lesson.status == .cancelled)
            }
            NSColor.labelColor.withAlphaComponent(0.1).setFill()
            if day.rect.maxX < content.width - 0.5 { NSRect(x: day.rect.maxX - 1, y: 0, width: 1, height: content.height).fill() }
        }
        NSColor.labelColor.withAlphaComponent(0.1).setFill()
        NSRect(x: 0, y: content.height - 1, width: content.width, height: 1).fill()
    }

    private func drawText(_ value: String, rect: NSRect, font: NSFont, color: NSColor,
                          alignment: NSTextAlignment = .left, strike: Bool = false) {
        guard rect.width > 0 else { return }
        let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail; paragraph.alignment = alignment
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .paragraphStyle: paragraph]
        if strike { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
        (value as NSString).draw(in: rect, withAttributes: attributes)
    }
    private func textWidth(_ value: String, font: NSFont) -> CGFloat { ceil((value as NSString).size(withAttributes: [.font: font]).width) }
    private func statusColor(_ status: LessonStatus) -> NSColor {
        switch status { case .scheduled: return .systemBlue; case .pending: return .systemOrange; case .confirmed: return .systemTeal; case .cancelled: return .secondaryLabelColor }
    }
    override func viewDidChangeEffectiveAppearance() { super.viewDidChangeEffectiveAppearance(); needsDisplay = true }

    private func hit(at point: NSPoint) -> Hit? {
        guard let day = days.firstIndex(where: { $0.rect.contains(point) }) else { return nil }
        if days[day].moreRect?.contains(point) == true { return .more(day) }
        if let event = days[day].eventRects.firstIndex(where: { $0.contains(point) }) { return .lesson(day, event) }
        return .day(day)
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) {
        pressPoint = convert(event.locationInWindow, from: nil); pressed = hit(at: pressPoint); didDrag = false
        if case .day(let day) = pressed {
            content?.select(days[day].info.date)
            if event.clickCount == 2 { content?.create(days[day].info.date); pressed = nil }
        }
    }
    override func mouseUp(with event: NSEvent) {
        defer { pressed = nil; didDrag = false }
        guard !didDrag, let pressed, hit(at: convert(event.locationInWindow, from: nil)) == pressed else { return }
        activate(pressed)
    }
    private func activate(_ hit: Hit) {
        guard let content else { return }
        switch hit {
        case .day(let day):
            CalendarClipboard.shared.selectTarget(.day(days[day].info.date))
            content.select(days[day].info.date)
        case .more(let day):
            present(CalendarDayAgenda(date: days[day].info.date, lessons: days[day].lessons, actions: content),
                    at: days[day].moreRect ?? days[day].rect, size: NSSize(width: 320, height: 380))
        case .lesson(let day, let index):
            let lesson = days[day].lessons[index]
            CalendarClipboard.shared.select(lesson, target: .day(days[day].info.date))
            present(LessonDetailView(lesson: lesson, edit: { [weak self] in self?.popover?.close(); content.edit(lesson) },
                                    confirm: { [weak self] in self?.popover?.close(); content.confirm(lesson) },
                                    cancel: { [weak self] in self?.popover?.close(); content.cancel(lesson) },
                                    remove: { [weak self] in self?.popover?.close(); content.remove(lesson) }),
                    at: days[day].eventRects[index], size: NSSize(width: 320, height: 540))
        }
    }
    private func present<Content: View>(_ view: Content, at rect: NSRect, size: NSSize) {
        popover?.close()
        let popup = NSPopover(); popup.behavior = .transient; popup.contentSize = size
        popup.contentViewController = NSHostingController(rootView: view.environment(\.locale, Locale(identifier: "zh_CN")).tint(content?.theme.primary ?? .accentColor))
        popover = popup
        popup.show(relativeTo: rect, of: self, preferredEdge: .maxX)
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        guard let content, let hit = hit(at: convert(event.locationInWindow, from: nil)) else { return nil }
        let menu = NSMenu()
        menu.autoenablesItems = false
        func add(_ title: String, _ action: @escaping () -> Void) { menu.addItem(CalendarActionMenuItem(title: title, action: action)) }
        switch hit {
        case .lesson(let day, let index):
            let lesson = days[day].lessons[index]
            add("查看课程") { [weak self] in self?.activate(hit) }
            add("复制课程") { CalendarClipboard.shared.copy(lesson) }
            menu.addItem(CalendarClipboard.shared.pasteMenuItem(at: .day(days[day].info.date)))
            if lesson.status.isOpen {
                add("编辑课程…") { content.edit(lesson) }
                add("确认金额…") { content.confirm(lesson) }
                add("取消课程…") { content.cancel(lesson) }
            }
            menu.addItem(.separator())
            add("删除课程…") { content.remove(lesson) }
        case .day(let day), .more(let day):
            let date = days[day].info.date
            add("新建课程…") { content.select(date); content.create(date) }
            menu.addItem(CalendarClipboard.shared.pasteMenuItem(at: .day(date)))
            if !days[day].lessons.isEmpty { add("查看当天全部课程") { [weak self] in self?.activate(.more(day)) } }
        }
        return menu
    }

    override func mouseDragged(with event: NSEvent) {
        guard !didDrag, case .lesson(let day, let index) = pressed else { return }
        let point = convert(event.locationInWindow, from: nil)
        guard hypot(point.x - pressPoint.x, point.y - pressPoint.y) > 4 else { return }
        let lesson = days[day].lessons[index]
        guard lesson.status.isOpen else { return }
        didDrag = true; popover?.close()
        let writer = NSPasteboardItem(); writer.setString(CourseCalendar.dragPrefix + lesson.id, forType: .string)
        let item = NSDraggingItem(pasteboardWriter: writer)
        let rect = days[day].eventRects[index]
        let image = NSImage(size: rect.size, flipped: true) { [weak self] bounds in
            self?.statusColor(lesson.status).withAlphaComponent(0.2).setFill(); bounds.fill()
            self?.drawText(lesson.title, rect: bounds.insetBy(dx: 5, dy: 1), font: .systemFont(ofSize: 11), color: .labelColor)
            return true
        }
        item.setDraggingFrame(rect, contents: image)
        beginDraggingSession(with: [item], event: event, source: self)
    }
    func draggingSession(_ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext) -> NSDragOperation { context == .withinApplication ? .move : [] }
    func draggingSession(_ session: NSDraggingSession, endedAt screenPoint: NSPoint, operation: NSDragOperation) { pressed = nil; didDrag = false }
    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { updateDrop(sender) }
    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation { updateDrop(sender) }
    private func updateDrop(_ sender: NSDraggingInfo) -> NSDragOperation {
        guard sender.draggingPasteboard.string(forType: .string)?.hasPrefix(CourseCalendar.dragPrefix) == true else { return [] }
        let point = convert(sender.draggingLocation, from: nil)
        let next = days.firstIndex { $0.rect.contains(point) }
        if next != dropDay { dropDay = next; needsDisplay = true }
        return next == nil ? [] : .move
    }
    override func draggingExited(_ sender: NSDraggingInfo?) { dropDay = nil; needsDisplay = true }
    override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool {
        sender.draggingPasteboard.string(forType: .string)?.hasPrefix(CourseCalendar.dragPrefix) == true
    }
    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        defer { dropDay = nil; needsDisplay = true }
        guard let value = sender.draggingPasteboard.string(forType: .string), value.hasPrefix(CourseCalendar.dragPrefix),
              let day = days.firstIndex(where: { $0.rect.contains(convert(sender.draggingLocation, from: nil)) }) else { return false }
        return content?.reschedule(String(value.dropFirst(CourseCalendar.dragPrefix.count)), days[day].info.date) ?? false
    }
    override func concludeDragOperation(_ sender: NSDraggingInfo?) { dropDay = nil; needsDisplay = true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self)
        addTrackingArea(area); tracking = area
    }
    override func mouseMoved(with event: NSEvent) {
        let text: String?
        switch hit(at: convert(event.locationInWindow, from: nil)) {
        case .lesson(let day, let index):
            let lesson = days[day].lessons[index]
            text = "\(lesson.title) · \(lesson.timeText) · \(lesson.status.title)"
            CalendarClipboard.shared.hover(owner: clipboardOwner, lesson: lesson, target: .day(days[day].info.date))
        case .more(let day):
            text = "查看当天全部 \(days[day].lessons.count) 节课程"
            CalendarClipboard.shared.hover(owner: clipboardOwner, target: .day(days[day].info.date))
        case .day(let day):
            text = nil
            CalendarClipboard.shared.hover(owner: clipboardOwner, target: .day(days[day].info.date))
        default:
            text = nil
            CalendarClipboard.shared.leave(owner: clipboardOwner)
        }
        if toolTip != text { toolTip = text }
    }
    override func mouseExited(with event: NSEvent) {
        toolTip = nil
        CalendarClipboard.shared.leave(owner: clipboardOwner)
    }

    override func accessibilityChildren() -> [Any]? { axElements }
    private func rebuildAccessibility() {
        axElements = []
        for (day, item) in days.enumerated() {
            addAccessible(hit: .day(day), rect: item.dateRect, label: "\(item.info.accessibility)，\(item.lessons.count) 节课程")
            if let rect = item.moreRect { addAccessible(hit: .more(day), rect: rect, label: "另有 \(item.lessons.count - 3) 节课程，查看当天全部课程") }
            for (index, rect) in item.eventRects.enumerated() {
                let lesson = item.lessons[index]
                addAccessible(hit: .lesson(day, index), rect: rect, label: "\(lesson.title)，\(lesson.timeText)，\(lesson.status.title)")
            }
        }
    }
    private func addAccessible(hit: Hit, rect: NSRect, label: String) {
        let element = CalendarCellAccessibilityElement()
        element.owner = self; element.localFrame = rect
        element.setAccessibilityElement(true); element.setAccessibilityEnabled(true)
        element.setAccessibilityParent(self); element.setAccessibilityRole(.button); element.setAccessibilityLabel(label)
        element.press = { [weak self] in self?.activate(hit); return self != nil }
        if case .day(let day) = hit {
            let date = days[day].info.date
            element.setAccessibilityCustomActions([NSAccessibilityCustomAction(name: "新建课程", handler: { [weak self] in
                self?.content?.select(date); self?.content?.create(date); return self != nil
            })])
        }
        axElements.append(element)
    }
}

final class CalendarCellAccessibilityElement: NSAccessibilityElement {
    weak var owner: NSView?
    var localFrame = NSRect.zero
    var press: (() -> Bool)?
    override func accessibilityFrame() -> NSRect {
        guard let owner, let window = owner.window else { return .zero }
        return window.convertToScreen(owner.convert(localFrame, to: nil))
    }
    override func accessibilityPerformPress() -> Bool { press?() ?? false }
}

final class CalendarActionMenuItem: NSMenuItem {
    private let handler: () -> Void
    init(title: String, action: @escaping () -> Void) {
        handler = action
        super.init(title: title, action: #selector(invoke), keyEquivalent: "")
        target = self
    }
    required init(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func invoke() { handler() }
}

private struct CalendarDayAgenda: View {
    var date: Date
    var lessons: [Lesson]
    var actions: CalendarMonthRow
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(date.formatted(.dateTime.month().day().weekday(.wide))).font(.headline)
                Spacer()
                Button { actions.create(date) } label: { Image(systemName: "plus") }.help("新建课程")
            }
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(lessons) { lesson in
                        CalendarLessonItem(lesson: lesson, edit: actions.edit, confirm: actions.confirm, cancel: actions.cancel, remove: actions.remove)
                    }
                }
            }
        }.padding(20).frame(width: 320)
    }
}
