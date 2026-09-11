import SwiftUI

struct LessonDetailView: View {
    var lesson: Lesson
    var edit: () -> Void; var confirm: () -> Void; var cancel: () -> Void; var remove: () -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Label("课程详情", systemImage: "doc.text").font(.subheadline).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 10) {
                    Text(lesson.title).font(.title2.bold()).textSelection(.enabled)
                    StatusLabel(status: lesson.status)
                }
                Divider()
                VStack(alignment: .leading, spacing: 16) {
                    detail("学生", lesson.studentText)
                    detail("日期", lesson.start.formatted(.dateTime.year().month().day().weekday()))
                    detail("时间", lesson.timeText)
                    detail("年级", lesson.grade.isEmpty ? "未设置" : lesson.grade)
                    detail("课程类型", lesson.courseType.isEmpty ? "未设置" : lesson.courseType)
                }
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    Text(lesson.status == .confirmed ? "实际金额" : "默认金额").font(.caption).foregroundStyle(.secondary)
                    Text(money(lesson.status == .confirmed ? (lesson.finalAmount ?? 0) : lesson.defaultAmount))
                        .font(.system(size: 32, weight: .semibold, design: .rounded)).monospacedDigit()
                    if lesson.status == .cancelled { Text("课程已取消，收入记为 ¥0.00").font(.caption).foregroundStyle(.secondary) }
                }
                if !lesson.note.isEmpty { detail("备注", lesson.note) }
                if lesson.status.isOpen {
                    VStack(spacing: 10) {
                        Button(action: confirm) { Text("确认金额").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large)
                        Button(action: edit) { Text("编辑课程").frame(maxWidth: .infinity) }.controlSize(.large)
                        Button("取消课程…", role: .destructive, action: cancel).buttonStyle(.link).padding(.top, 4)
                    }
                }
                Divider()
                Button("删除课程…", role: .destructive, action: remove).buttonStyle(.link).font(.caption)
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }.background(.background)
    }
    private func detail(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).textSelection(.enabled)
        }
    }
}

struct LessonEditorView: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    var lesson: Lesson?
    var date: Date
    var startAtSelectedTime = false
    @State private var draft = LessonDraft()
    @State private var validation: String?
    var body: some View {
        VStack(spacing: 0) {
            HStack { Text(lesson == nil ? "新建课程" : "编辑课程").font(.title2.bold()); Spacer() }.padding(24)
            Form {
                Section("课程信息") {
                    TextField("学生", text: $draft.students, prompt: Text("多个学生用 / 分隔"))
                    TextField("课程名称", text: $draft.title, prompt: Text("默认使用学生姓名"))
                    LedgerDatePicker(title: "上课日期", selection: $draft.date, tint: store.accent)
                    DatePicker("开始时间", selection: $draft.start, displayedComponents: .hourAndMinute)
                    DatePicker("结束时间", selection: $draft.end, displayedComponents: .hourAndMinute)
                }
                Section("课程安排") {
                    TextField("年级", text: $draft.grade, prompt: Text("例如：七年级"))
                    Picker("课程类型", selection: $draft.courseType) {
                        ForEach(Array(Set(["一对一", "小班课", "一对二", "一对多", "其他", draft.courseType])).sorted(), id: \.self) {
                            Text($0.isEmpty ? "未设置" : $0).tag($0)
                        }
                    }
                    TextField("默认金额（元）", text: $draft.amount)
                    TextField("备注", text: $draft.note, axis: .vertical).lineLimit(3...5)
                }
            }.formStyle(.grouped)
            if let validation { Text(validation).foregroundStyle(.red).font(.callout).padding(.horizontal, 24).padding(.bottom, 12) }
            Divider()
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("保存课程") {
                    do {
                        _ = try draft.validated()
                        if store.save(draft, editingID: lesson?.id) { dismiss() }
                        else { validation = store.error; store.error = nil }
                    } catch { validation = error.localizedDescription }
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
            }.padding(20)
        }.frame(width: 520, height: 620)
        .onAppear {
            if let lesson { draft = LessonDraft(lesson: lesson) }
            else {
                draft.date = date
                draft.amount = store.settings["default_amount"] ?? "150"
                if startAtSelectedTime {
                    draft.start = date
                    let endOfDay = Calendar.current.date(bySettingHour: 23, minute: 59, second: 0, of: date)!
                    draft.end = min(date.addingTimeInterval(3600), endOfDay)
                }
            }
        }
    }
}

struct ConfirmLessonView: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    var lesson: Lesson
    @State private var amount = ""
    @State private var note = ""
    @State private var validation: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("确认课程金额").font(.title2.bold())
            VStack(alignment: .leading, spacing: 6) {
                Text(lesson.title).font(.headline)
                Text("\(LedgerDate.day(lesson.start)) · \(lesson.timeText)").foregroundStyle(.secondary)
            }
            Form {
                TextField("实际金额（元）", text: $amount)
                TextField("备注", text: $note, axis: .vertical).lineLimit(2...4)
            }
            Text("确认后会计入收入统计，无法再次确认或取消。")
                .font(.caption).foregroundStyle(.secondary)
            if let validation { Text(validation).foregroundStyle(.red) }
            HStack {
                Spacer()
                Button("返回") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("确认金额") {
                    do {
                        let value = try parseAmount(amount)
                        if store.perform({ try store.requireDatabase().confirm([lesson.id], amount: value, note: note) }) { dismiss() }
                        else { validation = store.error; store.error = nil }
                    } catch { validation = error.localizedDescription }
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
            }
        }.padding(28).frame(width: 450)
        .onAppear { amount = String(lesson.defaultAmount); note = lesson.note }
    }
}

struct ImportPreviewView: View {
    @EnvironmentObject private var store: LedgerStore
    @Environment(\.dismiss) private var dismiss
    var preview: ImportPreview
    @State private var validation: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("导入预览").font(.title2.bold())
            Text(preview.filename).foregroundStyle(.secondary)
            HStack(spacing: 20) {
                Label("共 \(preview.totalRows) 行", systemImage: "tablecells")
                Label("可导入 \(preview.lessons.count) 节", systemImage: "checkmark.circle").foregroundStyle(.teal)
                if !preview.failures.isEmpty { Label("\(preview.failures.count) 行有误", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
            }
            Table(preview.lessons) {
                TableColumn("学生", value: \.studentText)
                TableColumn("日期") { Text(LedgerDate.day($0.start)) }
                TableColumn("时间", value: \.timeText)
                TableColumn("金额") { Text(money($0.amount)) }
                TableColumn("状态") { StatusLabel(status: $0.status) }
            }.frame(minHeight: 220)
            if !preview.failures.isEmpty {
                GroupBox("需要修正的行") {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(preview.failures) { Text("第 \($0.id) 行：\($0.reason)").frame(maxWidth: .infinity, alignment: .leading) }
                        }.font(.caption).padding(8)
                    }.frame(height: 80)
                }
            }
            Text("导入将追加课程；重复导入同一文件会产生重复记录。若文件带有状态和实际金额，将一并保留。")
                .font(.caption).foregroundStyle(.secondary)
            if let validation { Text(validation).foregroundStyle(.red).font(.caption) }
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("导入 \(preview.lessons.count) 节课程") {
                    store.commitImport(preview)
                    if let error = store.error { validation = error; store.error = nil }
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(preview.lessons.isEmpty)
            }
        }.padding(24).frame(width: 740, height: preview.failures.isEmpty ? 470 : 570)
    }
}
