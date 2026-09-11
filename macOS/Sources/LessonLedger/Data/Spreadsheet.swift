import Foundation
import JavaScriptCore

struct ImportFailure: Identifiable {
    var id: Int
    var reason: String
}
struct ImportPreview: Identifiable {
    let id = UUID()
    var filename: String
    var totalRows: Int
    var lessons: [Lesson]
    var failures: [ImportFailure]
}

/// SheetJS is used only as an offline file codec in JavaScriptCore. All UI is SwiftUI/AppKit.
final class Spreadsheet {
    private let context: JSContext
    init() throws {
        guard let context = JSContext() else { throw LedgerError.message("无法初始化 Excel 读取器。") }
        self.context = context
        let url = Bundle.ledger.url(forResource: "xlsx.full.min", withExtension: "js")!
        context.evaluateScript(try String(contentsOf: url))
        try checkException()
    }
    private func checkException() throws {
        if let exception = context.exception {
            let message = exception.toString() ?? "文件无法解析"
            context.exception = nil
            throw LedgerError.message("Excel 处理失败：\(message)")
        }
    }
    func read(_ url: URL) throws -> ImportPreview {
        let attributes = try url.resourceValues(forKeys: [.fileSizeKey])
        guard (attributes.fileSize ?? 0) <= 5 * 1024 * 1024 else { throw LedgerError.message("导入文件不能超过 5MB。") }
        let data = try Data(contentsOf: url)
        context.setObject(data.base64EncodedString(), forKeyedSubscript: "inputBase64" as NSString)
        // Format numeric Excel dates/times explicitly; do not reinterpret serial dates as UTC instants.
        let result = context.evaluateScript("""
            (function() {
                var wb = XLSX.read(inputBase64, {type:'base64', cellDates:false});
                if (!wb.SheetNames.length) throw new Error('工作簿没有工作表');
                var sheet = wb.Sheets[wb.SheetNames[0]];
                var rows = XLSX.utils.sheet_to_json(sheet, {defval:'', raw:true});
                var dates = ['日期','上课日期','课程日期','date'];
                var times = ['开始时间','上课时间','start','start_time','结束时间','下课时间','end','end_time'];
                return JSON.stringify(rows.map(function(row) {
                    Object.keys(row).forEach(function(key) {
                        if (typeof row[key] === 'number' && (dates.indexOf(key)>=0 || times.indexOf(key)>=0)) {
                            row[key] = XLSX.SSF.format(dates.indexOf(key)>=0 ? 'yyyy-mm-dd' : 'hh:mm', row[key],
                                {date1904:!!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904)});
                        }
                    });
                    row.__sourceRow = row.__rowNum__ + 1;
                    return row;
                }));
            })()
            """)
        try checkException()
        guard let json = result?.toString()?.data(using: .utf8),
              let rows = try JSONSerialization.jsonObject(with: json) as? [[String: Any]] else {
            throw LedgerError.message("无法读取课程工作表。")
        }
        var preview = ImportPreview(filename: url.lastPathComponent, totalRows: rows.count, lessons: [], failures: [])
        for (index, row) in rows.enumerated() {
            do { preview.lessons.append(try Self.parseRow(row)) }
            catch { preview.failures.append(ImportFailure(id: row["__sourceRow"] as? Int ?? index + 2, reason: error.localizedDescription)) }
        }
        return preview
    }
    static func parseRow(_ row: [String: Any]) throws -> Lesson {
        func field(_ aliases: [String], required: Bool = false) throws -> String {
            for alias in aliases {
                if let value = row[alias], !(value is NSNull) {
                    let text = String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !text.isEmpty { return text }
                }
            }
            if required { throw LedgerError.message("缺少必要字段：\(aliases[0])") }
            return ""
        }
        var draft = LessonDraft()
        draft.date = try LedgerDate.parseDay(field(["日期", "上课日期", "课程日期", "date"], required: true))
        draft.start = try LedgerDate.parseTime(field(["开始时间", "上课时间", "start", "start_time"], required: true))
        draft.end = try LedgerDate.parseTime(field(["结束时间", "下课时间", "end", "end_time"], required: true))
        draft.students = try field(["学生", "学生姓名", "姓名", "student"], required: true)
        draft.grade = try field(["年级", "grade"])
        draft.courseType = try field(["课程类型", "类型", "班型", "course_type"])
        draft.amount = try field(["默认金额", "金额", "课时费", "费用", "price"])
        draft.note = try field(["备注", "note"])
        draft.title = try field(["课程名称", "title"])
        let statusText = try field(["状态", "status"])
        if !statusText.isEmpty {
            guard let status = LessonStatus.allCases.first(where: { $0.title == statusText || $0.rawValue == statusText }) else {
                throw LedgerError.message("无法识别课程状态：\(statusText)")
            }
            draft.restoredStatus = status
            if status == .confirmed {
                draft.restoredFinalAmount = try parseAmount(field(["实际金额", "final_amount"], required: true))
            } else if status == .cancelled { draft.restoredFinalAmount = 0 }
        }
        return try draft.validated()
    }
    func write(lessons: [Lesson], settings: [String: String], to url: URL) throws {
        let rows: [[String: Any]] = lessons.map { lesson in
            ["课程名称": lesson.title, "日期": LedgerDate.day(lesson.start), "开始时间": LedgerDate.time(lesson.start),
             "结束时间": LedgerDate.time(lesson.end), "学生": lesson.studentText, "年级": lesson.grade,
             "课程类型": lesson.courseType, "默认金额": lesson.defaultAmount,
             "实际金额": lesson.finalAmount.map { $0 as Any } ?? "", "状态": lesson.status.title, "备注": lesson.note]
        }
        let payload: [String: Any] = ["lessons": rows, "settings": settings.sorted { $0.key < $1.key }.map { ["设置项": $0.key, "值": $0.value] }]
        let data = try JSONSerialization.data(withJSONObject: payload)
        context.setObject(String(data: data, encoding: .utf8)!, forKeyedSubscript: "exportJSON" as NSString)
        let result = context.evaluateScript("""
            (function() {
                var payload = JSON.parse(exportJSON), wb = XLSX.utils.book_new();
                var sheet = XLSX.utils.json_to_sheet(payload.lessons, {header:['课程名称','日期','开始时间','结束时间','学生','年级','课程类型','默认金额','实际金额','状态','备注']});
                sheet['!cols'] = [{wch:22},{wch:14},{wch:12},{wch:12},{wch:24},{wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:36}];
                XLSX.utils.book_append_sheet(wb, sheet, '课程');
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payload.settings), '设置');
                return XLSX.write(wb, {bookType:'xlsx',type:'base64'});
            })()
            """)
        try checkException()
        guard let text = result?.toString(), let output = Data(base64Encoded: text) else { throw LedgerError.message("无法生成 Excel 文件。") }
        try output.write(to: url, options: .atomic)
    }
}
