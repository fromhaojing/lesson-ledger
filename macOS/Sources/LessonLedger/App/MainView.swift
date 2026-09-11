import SwiftUI
import Combine

enum Page: String, CaseIterable, Identifiable {
    case today = "今天", calendar = "课程日历", lessons = "全部课程", pending = "待确认", statistics = "统计"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .today: return "sun.max"
        case .calendar: return "calendar"
        case .lessons: return "books.vertical"
        case .pending: return "checkmark.circle"
        case .statistics: return "chart.bar.xaxis"
        }
    }
}
struct EditorRequest: Identifiable {
    var id = UUID()
    var lesson: Lesson?
    var date: Date
    var startAtSelectedTime = false
}
struct MainView: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var page: Page? = .today
    @State private var search = ""
    @State private var selected: Set<String> = []
    @State private var date = Date()
    @State private var currentDay = Calendar.current.startOfDay(for: Date())
    @State private var calendarMode: CalendarDisplayMode = .month
    @State private var editor: EditorRequest?
    @State private var confirmation: Lesson?
    @State private var deleteTarget: Lesson?
    @State private var cancelTarget: Lesson?
    @State private var confirmBatch = false
    @State private var statusFilter = "all"
    private let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    private var matchingLessons: [Lesson] {
        store.lessons.filter { lesson in
            search.isEmpty || [lesson.title, lesson.studentText, lesson.grade, lesson.courseType, lesson.note]
                .contains { $0.localizedCaseInsensitiveContains(search) }
        }
    }
    private var visibleLessons: [Lesson] {
        matchingLessons.filter { lesson in
            let inPage: Bool
            switch page {
            case .today: inPage = Calendar.current.isDate(lesson.start, inSameDayAs: currentDay)
            case .calendar: inPage = Calendar.current.isDate(lesson.start, inSameDayAs: date)
            case .pending: inPage = store.pending.contains { $0.id == lesson.id }
            default: inPage = true
            }
            return inPage && (statusFilter == "all" || lesson.status.rawValue == statusFilter)
        }
    }
    private var selectedLesson: Lesson? {
        guard selected.count == 1, let id = selected.first else { return nil }
        return store.lessons.first { $0.id == id }
    }
    var body: some View {
        NavigationSplitView {
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    Text("钱来")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                    ForEach(Page.allCases) { item in
                        Button { page = item } label: {
                            HStack(spacing: 10) {
                                Image(systemName: item.icon).frame(width: 20).accessibilityHidden(true)
                                Text(item.rawValue)
                                Spacer()
                                if item == .pending, !store.pending.isEmpty {
                                    Text("\(store.pending.count)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(SidebarNavigationButtonStyle(isSelected: page == item, theme: store.theme))
                        .accessibilityAddTraits(page == item ? [.isSelected] : [])
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 16)
            }
            .navigationSplitViewColumnWidth(min: 175, ideal: 200, max: 240)
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 12) {
                    Label(store.isPreview ? "演示模式" : "数据保存在此 Mac", systemImage: store.isPreview ? "eye" : "internaldrive")
                        .font(.caption).foregroundStyle(.secondary)
                    SettingsLink { Label("设置", systemImage: "gearshape") }.buttonStyle(.plain)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            }
        } detail: {
            HSplitView {
                VStack(spacing: 0) {
                    if page == .statistics {
                        StatisticsView()
                    } else if page == .calendar {
                        CalendarPanel(
                            date: $date, mode: $calendarMode, lessons: store.lessons, search: search, theme: store.theme,
                            reschedule: { store.reschedule($0, to: $1) },
                            create: { editor = EditorRequest(date: $0) },
                            createTimed: { editor = EditorRequest(date: $0, startAtSelectedTime: true) },
                            moveToTime: { store.reschedule($0, to: $1, keepingTime: false) },
                            pasteCourse: { store.pasteCourse($0, at: $1) },
                            edit: { editor = EditorRequest(lesson: $0, date: $0.start) },
                            confirm: { confirmation = $0 }, cancel: { cancelTarget = $0 }, remove: { deleteTarget = $0 }
                        )
                    } else {
                        header
                        lessonTable
                        HStack {
                            Text("\(visibleLessons.count) 节课程")
                            if !selected.isEmpty { Text("已选择 \(selected.count) 节") }
                            Spacer()
                            if page == .pending {
                                Button("按默认金额确认所选") { confirmBatch = true }.disabled(selected.isEmpty)
                            }
                        }.font(.caption).foregroundStyle(.secondary).padding(12)
                    }
                }.frame(minWidth: 520, maxWidth: .infinity, maxHeight: .infinity)
                if let lesson = selectedLesson, page != .statistics, page != .calendar {
                    LessonDetailView(lesson: lesson, edit: { editor = EditorRequest(lesson: lesson, date: lesson.start) },
                                     confirm: { confirmation = lesson }, cancel: { cancelTarget = lesson }, remove: { deleteTarget = lesson })
                        .frame(minWidth: 260, idealWidth: 290, maxWidth: 350, maxHeight: .infinity)
                }
            }
            .navigationTitle(page?.rawValue ?? "钱来")
            .searchable(text: $search, prompt: "搜索课程或学生")
            // Apply in the shared detail column, where SwiftUI owns the page toolbar.
            .toolbarBackground(.hidden, for: .windowToolbar)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    if store.isProcessingFile { ProgressView().controlSize(.small) }
                    if page == .calendar {
                        CalendarModeSwitcher(selection: $calendarMode, theme: store.theme)
                    }
                    Menu {
                        Button("导入 Excel…") { store.chooseImport() }
                        Button("导出 Excel…") { store.exportExcel() }
                        Button("保存导入模板…") { store.exportExcel(template: true) }
                        Divider()
                        Button("备份数据库…") { store.backup() }
                    } label: { Label("数据", systemImage: "square.and.arrow.down") }
                        .disabled(store.isProcessingFile)
                    if page != .calendar {
                        Button { newLesson() } label: { Label("新建课程", systemImage: "plus") }.help("新建课程（⌘N）")
                    }
                }
            }
        }
        .frame(minWidth: 920, minHeight: 640)
        .sheet(item: $editor) { request in
            LessonEditorView(lesson: request.lesson, date: request.date, startAtSelectedTime: request.startAtSelectedTime)
        }
        .sheet(item: $confirmation) { lesson in ConfirmLessonView(lesson: lesson) }
        .sheet(item: $store.importPreview) { preview in ImportPreviewView(preview: preview) }
        .alert("操作未完成", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("好", role: .cancel) { store.error = nil }
        } message: { Text(store.error ?? "") }
        .alert("已完成", isPresented: Binding(get: { store.notice != nil }, set: { if !$0 { store.notice = nil } })) {
            Button("好", role: .cancel) { store.notice = nil }
        } message: { Text(store.notice ?? "") }
        .confirmationDialog("删除这节课程？", isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }), titleVisibility: .visible) {
            Button("删除课程", role: .destructive) {
                if let lesson = deleteTarget, store.perform({ try store.requireDatabase().remove(lesson.id) }) { selected.remove(lesson.id) }
                deleteTarget = nil
            }
        } message: { Text("课程将从列表和统计中移除。") }
        .confirmationDialog("取消这节课程？", isPresented: Binding(get: { cancelTarget != nil }, set: { if !$0 { cancelTarget = nil } }), titleVisibility: .visible) {
            Button("取消课程", role: .destructive) {
                if let lesson = cancelTarget { store.perform { try store.requireDatabase().cancel(lesson.id) } }
                cancelTarget = nil
            }
        } message: { Text("取消后金额记为 0，无法再次确认。") }
        .confirmationDialog("确认所选 \(selected.count) 节课程？", isPresented: $confirmBatch, titleVisibility: .visible) {
            Button("按默认金额确认") { store.perform { try store.requireDatabase().confirm(Array(selected)) }; selected = [] }
        }
        .onReceive(NotificationCenter.default.publisher(for: .newLesson)) { _ in newLesson() }
        .onReceive(timer) { _ in refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
        .onChange(of: page) { _, _ in selected = []; statusFilter = "all" }
        .onChange(of: date) { _, _ in if !selected.isEmpty { selected = [] } }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in refresh() }
        .onChange(of: search) { _, _ in pruneSelection() }
        .onChange(of: statusFilter) { _, _ in pruneSelection() }
        .onChange(of: store.requestedLessonID) { _, id in
            if let id { page = .lessons; search = ""; statusFilter = "all"; selected = [id] }
        }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(page == .today ? currentDay.formatted(.dateTime.month(.wide).day().weekday(.wide)) : page?.rawValue ?? "课程")
                        .font(.title2.bold())
                    Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                if page == .lessons {
                    Picker("状态", selection: $statusFilter) {
                        Text("全部状态").tag("all")
                        ForEach(LessonStatus.allCases) { Text($0.title).tag($0.rawValue) }
                    }.labelsHidden().frame(width: 120)
                }
            }
            if page == .today || page == .pending {
                HStack(spacing: 16) {
                    MetricView(title: page == .pending ? "待确认金额" : "预计收入", value: money(visibleLessons.reduce(0) { $0 + $1.amount }), icon: "yensign.circle", color: store.accent)
                    MetricView(title: "已确认", value: money(visibleLessons.filter { $0.status == .confirmed }.reduce(0) { $0 + ($1.finalAmount ?? 0) }), icon: "checkmark.seal", color: .teal)
                    MetricView(title: "课程", value: "\(visibleLessons.count) 节", icon: "book.closed", color: .blue)
                }
            }
        }.padding(24)
    }
    private var subtitle: String {
        switch page {
        case .today: return "安排好每一节课，记下每一份收获。"
        case .pending: return "课程已结束，确认本次实际金额。"
        case .calendar: return "按日期查看课程安排。"
        default: return "所有课程与收款记录，尽在这里。"
        }
    }
    private var lessonTable: some View {
        Table(visibleLessons, selection: $selected) {
            TableColumn("课程 / 学生") { lesson in
                VStack(alignment: .leading, spacing: 4) {
                    Text(lesson.title).fontWeight(.medium).lineLimit(1)
                    Text([lesson.grade, lesson.courseType].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }.padding(.vertical, 7)
            }.width(min: 145, ideal: 200)
            TableColumn("日期") { Text(LedgerDate.day($0.start)).foregroundStyle(.secondary) }.width(90)
            TableColumn("时间") { Text($0.timeText).monospacedDigit() }.width(105)
            TableColumn("金额") { Text(money($0.amount)).monospacedDigit() }.width(min: 75, ideal: 90)
            TableColumn("状态") { StatusLabel(status: $0.status) }.width(70)
        }
        .contextMenu(forSelectionType: String.self) { ids in
            if ids.count == 1, let lesson = store.lessons.first(where: { ids.contains($0.id) }) {
                Button("查看课程") { selected = ids }
                if lesson.status.isOpen {
                    Button("编辑课程…") { editor = EditorRequest(lesson: lesson, date: lesson.start) }
                    Button("确认金额…") { confirmation = lesson }
                    Button("取消课程…", role: .destructive) { cancelTarget = lesson }
                }
                Divider()
                Button("删除课程…", role: .destructive) { deleteTarget = lesson }
            }
        } primaryAction: { ids in selected = ids }
        .overlay {
            if visibleLessons.isEmpty {
                ContentUnavailableView {
                    Label(search.isEmpty ? "还没有课程" : "没有匹配的课程", systemImage: search.isEmpty ? "calendar.badge.plus" : "magnifyingglass")
                } description: {
                    Text(search.isEmpty ? "新建一节课程，或从 Excel 导入课程安排。" : "试试其他学生姓名或课程名称。")
                } actions: {
                    if search.isEmpty { Button("新建课程") { newLesson() } }
                }
            }
        }
    }
    private func newLesson() { editor = EditorRequest(date: page == .calendar ? date : Date()) }
    private func refresh() {
        let day = Calendar.current.startOfDay(for: Date())
        if currentDay != day { currentDay = day }
        do { try store.reload(); pruneSelection(); store.scheduleNotifications() }
        catch { store.error = error.localizedDescription }
    }
    private func pruneSelection() {
        guard !selected.isEmpty else { return }
        let remaining = selected.intersection(Set(visibleLessons.map(\.id)))
        if remaining != selected { selected = remaining }
    }
}

private struct SidebarNavigationButtonStyle: ButtonStyle {
    var isSelected: Bool
    var theme: ThemeColor
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(isSelected ? .semibold : .regular))
            .foregroundStyle(isSelected ? theme.primaryDark : Color.primary)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .frame(maxWidth: .infinity)
            .background {
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? theme.surfaceSoft : Color.primary.opacity(isHovered || configuration.isPressed ? 0.06 : 0))
            }
            .opacity(configuration.isPressed ? 0.75 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 8))
            .onHover { isHovered = $0 }
    }
}

struct MetricView: View {
    var title: String; var value: String; var icon: String; var color: Color
    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Label(title, systemImage: icon).font(.subheadline).foregroundStyle(.secondary)
                Text(value).font(.system(size: 25, weight: .semibold, design: .rounded)).foregroundStyle(color).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
        }
    }
}
struct StatusLabel: View {
    var status: LessonStatus
    var body: some View {
        HStack(spacing: 5) { Circle().fill(status.color).frame(width: 6, height: 6); Text(status.title) }
            .font(.caption).foregroundStyle(status.color)
    }
}
