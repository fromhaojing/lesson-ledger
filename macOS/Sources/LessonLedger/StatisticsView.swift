import SwiftUI
import Charts

struct StudentCount: Identifiable { var name: String; var count: Int; var id: String { name } }
struct IncomePoint: Identifiable { var date: Date; var amount: Double; var id: Date { date } }
struct StatisticsView: View {
    @EnvironmentObject private var store: LedgerStore
    @State private var start = Calendar.current.dateInterval(of: .month, for: Date())!.start
    @State private var end = Date()
    private var lessons: [Lesson] {
        let from = Calendar.current.startOfDay(for: start)
        let to = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: end))!
        return store.lessons.filter { $0.start >= from && $0.start < to }
    }
    private var confirmed: [Lesson] { lessons.filter { $0.status == .confirmed } }
    private var students: [StudentCount] {
        var counts: [String: Int] = [:]
        for lesson in confirmed { for name in lesson.students { counts[name, default: 0] += 1 } }
        return counts.map { StudentCount(name: $0.key, count: $0.value) }.sorted { $0.count == $1.count ? $0.name < $1.name : $0.count > $1.count }
    }
    private var income: [IncomePoint] {
        Dictionary(grouping: confirmed, by: { Calendar.current.startOfDay(for: $0.start) })
            .map { IncomePoint(date: $0.key, amount: $0.value.reduce(0) { $0 + ($1.finalAmount ?? 0) }) }.sorted { $0.date < $1.date }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("每一节课，都有收获").font(.title2.bold())
                        Text("按上课日期统计已确认的实际收入。").foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("本月") {
                        start = Calendar.current.dateInterval(of: .month, for: Date())!.start; end = Date()
                    }
                }
                HStack(spacing: 16) {
                    LedgerDatePicker(title: "从", selection: $start, upperBound: end, tint: store.accent)
                    LedgerDatePicker(title: "至", selection: $end, lowerBound: start, tint: store.accent)
                    Spacer()
                }.fixedSize(horizontal: true, vertical: false)
                HStack(spacing: 16) {
                    MetricView(title: "确认收入", value: money(confirmed.reduce(0) { $0 + ($1.finalAmount ?? 0) }), icon: "yensign.circle", color: store.accent)
                    MetricView(title: "确认课程", value: "\(confirmed.count) 节", icon: "checkmark.seal", color: .teal)
                    MetricView(title: "待确认", value: "\(lessons.filter { $0.status.isOpen && $0.end < Date() }.count) 节", icon: "clock", color: .orange)
                }
                GroupBox("收入趋势") {
                    if income.isEmpty {
                        ContentUnavailableView("暂无收入记录", systemImage: "chart.bar", description: Text("确认课程金额后，收入将在这里显示。"))
                            .frame(height: 210)
                    } else {
                        Chart(income) { point in
                            BarMark(x: .value("日期", point.date, unit: .day), y: .value("收入", point.amount))
                                .foregroundStyle(store.accent.gradient).cornerRadius(4)
                        }
                        .chartYAxis { AxisMarks(position: .leading) }
                        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 6)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.month().day()) } }
                        .frame(height: 210).padding(16)
                    }
                }
                GroupBox("学生课次排行") {
                    if students.isEmpty {
                        ContentUnavailableView("暂无学生统计", systemImage: "person.2", description: Text("仅统计已确认课程；合班课程分别计入每位学生。"))
                            .frame(height: 160)
                    } else {
                        Chart(Array(students.prefix(10))) { student in
                            BarMark(x: .value("课次", student.count), y: .value("学生", student.name))
                                .foregroundStyle(store.accent.gradient).cornerRadius(3)
                                .annotation(position: .trailing) { Text("\(student.count) 节").font(.caption).foregroundStyle(.secondary) }
                        }.frame(height: CGFloat(min(students.count, 10) * 36 + 28)).padding(16)
                    }
                }
                if !students.isEmpty {
                    GroupBox("学生明细") {
                        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 12) {
                            ForEach(students) { student in
                                GridRow { Text(student.name); Spacer(); Text("\(student.count) 节").monospacedDigit().foregroundStyle(.secondary) }
                            }
                        }.padding(12)
                    }
                }
                Text("已取消 \(lessons.filter { $0.status == .cancelled }.count) 节 · 合班课程的课次分别计入每位学生，收入只计算一次。")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(24)
        }
    }
}
