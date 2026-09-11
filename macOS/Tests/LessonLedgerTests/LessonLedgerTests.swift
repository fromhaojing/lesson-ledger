import XCTest
import AppKit
@testable import LessonLedger

final class LessonLedgerTests: XCTestCase {
    private var directory: URL!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("LedgerTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }
    private func database() throws -> Database { try Database(url: directory.appendingPathComponent("test.db")) }
    private func lesson(offset: Int = -1) throws -> Lesson {
        var draft = LessonDraft(); draft.students = "林小满 / 陈一诺"; draft.note = "中文与引号 ' 测试"
        draft.date = Calendar.current.date(byAdding: .day, value: offset, to: Date())!
        return try draft.validated()
    }
    func testThemePreferencesSurviveReopeningAndRestoreLegacyPink() throws {
        let db = try database()
        XCTAssertEqual(try db.settings()["theme_color"], "red")
        try db.setSetting("theme_mode", "dark")
        for key in ["mint", "blue", "purple", "orange", "rose", "red", "pink"] {
            try db.setSetting("theme_color", key)
            let reopened = try Database(url: db.url)
            XCTAssertEqual(try reopened.settings()["theme_color"], key == "pink" ? "rose" : key)
            XCTAssertEqual(try reopened.settings()["theme_mode"], "dark")
        }
    }
    func testNativeThemeResolvesLightAndDarkAppearance() throws {
        let dynamicColor = ThemeColor.red.nativePrimary
        func hex(in name: NSAppearance.Name) throws -> Int {
            var resolved: NSColor?
            let appearance = try XCTUnwrap(NSAppearance(named: name))
            appearance.performAsCurrentDrawingAppearance { resolved = dynamicColor.usingColorSpace(.sRGB) }
            let color = try XCTUnwrap(resolved)
            return (Int((color.redComponent * 255).rounded()) << 16)
                | (Int((color.greenComponent * 255).rounded()) << 8)
                | Int((color.blueComponent * 255).rounded())
        }
        XCTAssertEqual(try hex(in: .aqua), 0xFF3B30)
        XCTAssertEqual(try hex(in: .darkAqua), 0xFF453A)
        XCTAssertEqual(try hex(in: .aqua), 0xFF3B30)
    }
    func testPersistenceAndStateTransitions() throws {
        let db = try database(), original = try lesson()
        try db.save(original); try db.refreshPending()
        XCTAssertEqual(try db.lessons().first?.status, .pending)
        try db.confirm([original.id], amount: 128.5, note: "实际结算")
        let persisted = try Database(url: db.url).lessons().first!
        XCTAssertEqual(persisted.students, ["林小满", "陈一诺"])
        XCTAssertEqual(persisted.finalAmount, 128.5)
        XCTAssertEqual(persisted.note, "实际结算")
        XCTAssertThrowsError(try db.confirm([original.id]))
        XCTAssertThrowsError(try db.cancel(original.id))
        XCTAssertThrowsError(try db.save(original, editingID: original.id))
        try db.remove(original.id)
        XCTAssertTrue(try db.lessons().isEmpty)
        XCTAssertEqual(try db.rows("SELECT COUNT(*) AS total FROM lesson").first?["total"], "1")
    }
    func testCancelledCourseCannotBeConfirmed() throws {
        let db = try database(), original = try lesson(offset: 1)
        try db.save(original); try db.cancel(original.id)
        XCTAssertEqual(try db.lessons().first?.finalAmount, 0)
        XCTAssertThrowsError(try db.confirm([original.id], amount: 100))
    }
    func testBatchConfirmationRollsBackOnStaleSelection() throws {
        let db = try database(), first = try lesson(), second = try lesson()
        try db.save(first); try db.save(second); try db.cancel(second.id)
        XCTAssertThrowsError(try db.confirm([first.id, second.id]))
        XCTAssertEqual(try db.lessons().first { $0.id == first.id }?.status, .scheduled)
    }
    func testEditingPendingIntoFutureReschedulesIt() throws {
        let db = try database(), original = try lesson()
        try db.save(original); try db.refreshPending()
        try db.save(lesson(offset: 5), editingID: original.id)
        XCTAssertEqual(try db.lessons().first?.status, .scheduled)
    }
    func testValidationRejectsInvalidInputs() throws {
        for amount in ["-1", "NaN", "Infinity", "abc", "1e308"] { XCTAssertThrowsError(try parseAmount(amount)) }
        XCTAssertEqual(try parseAmount("￥1,250.50"), 1250.5)
        XCTAssertThrowsError(try LedgerDate.parseDay("2026-02-30"))
        XCTAssertThrowsError(try LedgerDate.parseTime("25:00"))
        var draft = LessonDraft()
        XCTAssertThrowsError(try draft.validated())
        draft.students = "小满"; draft.end = draft.start
        XCTAssertThrowsError(try draft.validated())
    }
    func testExcelRoundTripPreservesStatusesAndMoney() throws {
        let codec = try Spreadsheet()
        var confirmed = try lesson(); confirmed.status = .confirmed; confirmed.finalAmount = 132.25
        var cancelled = try lesson(); cancelled.status = .cancelled; cancelled.finalAmount = 0
        let output = directory.appendingPathComponent("roundtrip.xlsx")
        try codec.write(lessons: [confirmed, cancelled], settings: ["default_amount": "150"], to: output)
        let preview = try codec.read(output)
        XCTAssertTrue(preview.failures.isEmpty)
        XCTAssertEqual(preview.lessons.count, 2)
        XCTAssertEqual(preview.lessons[0].finalAmount, 132.25)
        XCTAssertEqual(preview.lessons[0].status, .confirmed)
        XCTAssertEqual(preview.lessons[1].status, .cancelled)
        XCTAssertEqual(preview.lessons[0].students, confirmed.students)
        XCTAssertEqual(LedgerDate.day(preview.lessons[0].start), LedgerDate.day(confirmed.start))
        XCTAssertEqual(LedgerDate.time(preview.lessons[0].start), LedgerDate.time(confirmed.start))
    }
    func testImportAliasesAndConfirmedAmountValidation() throws {
        let row: [String: Any] = ["date": "2026/9/8", "start": "9:00", "end": "10:00", "student": "A，B", "price": "￥150"]
        XCTAssertEqual(try Spreadsheet.parseRow(row).students, ["A", "B"])
        var invalid = row; invalid["状态"] = "已确认"
        XCTAssertThrowsError(try Spreadsheet.parseRow(invalid))
    }
    func testExcelNumericDatesAndOriginalRowNumbers() throws {
        for fileExtension in ["xlsx", "xls"] {
            let fixture = Bundle.module.url(forResource: "numeric-dates", withExtension: fileExtension, subdirectory: "Fixtures")!
            let result = try Spreadsheet().read(fixture)
            XCTAssertEqual(result.totalRows, 2)
            XCTAssertEqual(result.lessons.count, 1)
            XCTAssertEqual(LedgerDate.day(result.lessons[0].start), "2026-09-08")
            XCTAssertEqual(LedgerDate.time(result.lessons[0].start), "09:00")
            XCTAssertEqual(result.failures.first?.id, 4)
        }
    }
    func testAtomicImportAndSQLiteBackup() throws {
        let db = try database()
        let original = try lesson()
        XCTAssertThrowsError(try db.importLessons([original, original], filename: "duplicate.xlsx", totalRows: 2, failures: 0))
        XCTAssertTrue(try db.lessons().isEmpty)
        XCTAssertTrue(try db.rows("SELECT * FROM import_batch").isEmpty)
        try db.importLessons([original], filename: "课程.xlsx", totalRows: 2, failures: 1)
        let backupURL = directory.appendingPathComponent("backup.db")
        try db.backup(to: backupURL)
        let restored = try Database(url: backupURL)
        XCTAssertEqual(try restored.lessons().first?.id, original.id)
        XCTAssertEqual(try restored.rows("SELECT failed_rows FROM import_batch").first?["failed_rows"], "1")
        XCTAssertEqual(try restored.settings()["default_amount"], "150")
    }
}
