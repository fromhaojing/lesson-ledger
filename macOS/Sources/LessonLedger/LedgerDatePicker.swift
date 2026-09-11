import SwiftUI

/// A date-only field shared by the lesson form and statistics filters.
struct LedgerDatePicker: View {
    var title: String
    @Binding var selection: Date
    var lowerBound: Date? = nil
    var upperBound: Date? = nil
    var tint: Color
    @State private var isPresented = false

    var body: some View {
        LabeledContent(title) {
            Button { isPresented.toggle() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "calendar").foregroundStyle(tint)
                    Text(selection.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits)))
                        .monospacedDigit().foregroundStyle(.primary)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
            }
            .buttonStyle(CalendarPickerButtonStyle(tint: tint, isSelected: false, isOutlined: true))
            .accessibilityLabel(title)
            .accessibilityValue(selection.formatted(.dateTime.year().month().day().weekday()))
            .popover(isPresented: $isPresented, arrowEdge: .bottom) {
                DatePickerPopover(selection: $selection, lowerBound: lowerBound, upperBound: upperBound,
                                  tint: tint, dismiss: { isPresented = false })
            }
        }
    }
}

/// Range checks operate on calendar days, so either endpoint can select the same day.
struct DatePickerCalendar {
    var calendar: Calendar
    var lowerBound: Date? = nil
    var upperBound: Date? = nil

    func contains(_ date: Date) -> Bool {
        let day = calendar.startOfDay(for: date)
        return (lowerBound.map { day >= calendar.startOfDay(for: $0) } ?? true)
            && (upperBound.map { day <= calendar.startOfDay(for: $0) } ?? true)
    }

    func intersects(_ interval: DateInterval) -> Bool {
        if let lowerBound, calendar.startOfDay(for: lowerBound) >= interval.end { return false }
        if let upperBound, calendar.startOfDay(for: upperBound) < interval.start { return false }
        return true
    }

    func days(in month: Date) -> [Date] {
        let start = calendar.dateInterval(of: .month, for: month)!.start
        let first = CourseCalendar.weekStart(for: start, calendar: calendar)
        // Keep the popover height stable as the user moves between months.
        return (0..<42).map { calendar.date(byAdding: .day, value: $0, to: first)! }
    }
}

private struct DatePickerPopover: View {
    @Environment(\.calendar) private var calendar
    @Environment(\.colorScheme) private var colorScheme
    @Binding var selection: Date
    var lowerBound: Date?
    var upperBound: Date?
    var tint: Color
    var dismiss: () -> Void
    @State private var displayedMonth: Date? = nil
    @State private var showsMonths = false
    @FocusState private var focusedDay: Date?

    private var rules: DatePickerCalendar {
        DatePickerCalendar(calendar: calendar, lowerBound: lowerBound, upperBound: upperBound)
    }
    private var month: Date { calendar.dateInterval(of: .month, for: displayedMonth ?? selection)!.start }
    private var months: [Date] {
        let start = calendar.dateInterval(of: .year, for: month)!.start
        let count = calendar.range(of: .month, in: .year, for: start)!.count
        return (0..<count).map { calendar.date(byAdding: .month, value: $0, to: start)! }
    }

    var body: some View {
        VStack(spacing: 14) {
            header
            Group {
                if showsMonths { monthGrid }
                else { dayGrid }
            }.frame(height: 258, alignment: .top)
            Divider()
            HStack {
                Text(Date().formatted(.dateTime.month().day().weekday()))
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("今天") { select(Date()) }
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(tint)
                    .buttonStyle(.plain).disabled(!rules.contains(Date()))
            }
        }
        .padding(18).frame(width: 310)
        .background {
            Rectangle().fill(.regularMaterial)
                .overlay(Color.white.opacity(colorScheme == .dark ? 0.06 : 0.45))
        }
        .onExitCommand(perform: dismiss)
        .onMoveCommand(perform: moveFocus)
    }

    private var header: some View {
        HStack(spacing: 4) {
            Button { showsMonths.toggle() } label: {
                HStack(spacing: 6) {
                    Text(showsMonths ? month.formatted(.dateTime.year()) : month.formatted(.dateTime.year().month()))
                        .font(.system(size: 16, weight: .semibold))
                    Image(systemName: showsMonths ? "chevron.up" : "chevron.down")
                        .font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary)
                }.padding(.horizontal, 6).frame(height: 30)
            }
            .buttonStyle(CalendarPickerButtonStyle(tint: tint))
            .help(showsMonths ? "返回日期选择" : "选择年份和月份")
            Spacer(minLength: 0)
            navigationButton(-1, icon: "chevron.left")
            navigationButton(1, icon: "chevron.right")
        }
    }

    private func navigationButton(_ offset: Int, icon: String) -> some View {
        let component: Calendar.Component = showsMonths ? .year : .month
        let target = calendar.date(byAdding: component, value: offset, to: month)!
        let title = showsMonths ? (offset < 0 ? "上一年" : "下一年") : (offset < 0 ? "上个月" : "下个月")
        return Button { displayedMonth = target } label: {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold)).frame(width: 30, height: 30)
        }
        .buttonStyle(CalendarPickerButtonStyle(tint: tint))
        .disabled(!rules.intersects(calendar.dateInterval(of: component, for: target)!))
        .accessibilityLabel(title).help(title)
    }

    private var dayGrid: some View {
        VStack(spacing: 6) {
            HStack(spacing: 3) {
                ForEach(Array(["日", "一", "二", "三", "四", "五", "六"].enumerated()), id: \.offset) { _, title in
                    Text(title).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity).frame(height: 24)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                ForEach(rules.days(in: month), id: \.self) { day in
                    dayButton(day)
                }
            }
        }
    }

    private func dayButton(_ day: Date) -> some View {
        let selected = calendar.isDate(day, inSameDayAs: selection)
        let inMonth = calendar.isDate(day, equalTo: month, toGranularity: .month)
        let today = calendar.isDateInToday(day)
        return Button { select(day) } label: {
            Text("\(calendar.component(.day, from: day))")
                .font(.system(size: 13, weight: selected || today ? .semibold : .regular)).monospacedDigit()
                .foregroundStyle(selected ? Color.white : (inMonth ? Color.primary : Color.secondary.opacity(0.55)))
                .frame(maxWidth: .infinity).frame(height: 35)
        }
        .buttonStyle(CalendarPickerButtonStyle(tint: tint, isSelected: selected, isToday: today))
        .disabled(!rules.contains(day))
        .focused($focusedDay, equals: day)
        .accessibilityLabel(day.formatted(.dateTime.year().month().day().weekday()) + (today ? "，今天" : ""))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var monthGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 10) {
            ForEach(months, id: \.self) { target in
                let selected = calendar.isDate(target, equalTo: selection, toGranularity: .month)
                Button { displayedMonth = target; showsMonths = false } label: {
                    Text(target.formatted(.dateTime.month(.wide)))
                        .font(.system(size: 13, weight: selected ? .semibold : .regular))
                        .foregroundStyle(selected ? Color.white : Color.primary)
                        .frame(maxWidth: .infinity).frame(height: 48)
                }
                .buttonStyle(CalendarPickerButtonStyle(tint: tint, isSelected: selected))
                .disabled(!rules.intersects(calendar.dateInterval(of: .month, for: target)!))
            }
        }.padding(.top, 12)
    }

    private func select(_ day: Date) {
        guard rules.contains(day) else { return }
        selection = calendar.startOfDay(for: day)
        dismiss()
    }

    private func moveFocus(_ direction: MoveCommandDirection) {
        guard !showsMonths else { return }
        let offset: Int
        switch direction {
        case .left: offset = -1
        case .right: offset = 1
        case .up: offset = -7
        case .down: offset = 7
        default: return
        }
        let base = focusedDay ?? (calendar.isDate(selection, equalTo: month, toGranularity: .month) ? selection : month)
        guard let target = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: base)),
              rules.contains(target) else { return }
        displayedMonth = target
        focusedDay = target
    }
}

private struct CalendarPickerButtonStyle: ButtonStyle {
    var tint: Color
    var isSelected = false
    var isToday = false
    var isOutlined = false
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(isSelected ? tint : Color.primary.opacity(configuration.isPressed ? 0.10 : (isHovered ? 0.065 : (isOutlined ? 0.025 : 0))))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(isToday && !isSelected ? tint.opacity(0.55) : Color.primary.opacity(isOutlined ? 0.10 : 0), lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 8))
            .opacity(isEnabled ? 1 : 0.28)
            .onHover { isHovered = $0 }
    }
}
