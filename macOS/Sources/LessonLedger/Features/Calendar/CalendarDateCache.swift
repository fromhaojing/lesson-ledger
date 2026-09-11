import Foundation
import CryptoKit

/// Rebuildable, configuration-scoped date metadata. No courses or UI selection are stored.
final class CalendarDateCache: @unchecked Sendable {
    static let shared = CalendarDateCache()
    static let didLoadMonths = Notification.Name("LessonLedger.calendarDatesLoaded")
    static let didChangeConfiguration = Notification.Name("LessonLedger.calendarDateConfigurationChanged")

    struct Month: Codable, Equatable, Sendable {
        var start: Date
        var end: Date
        var yearStart: Date
        var yearMonths: [Date]
        var title: String
        var gridCount: Int
        var days: [CourseCalendar.DayPresentation]
    }

    struct Change: Hashable, Sendable {
        var configuration: String
        var start: Date
        var end: Date
    }

    private struct Configuration: Codable, Equatable {
        var version = 1
        var calendar: String
        var timeZone: String
        var locale = "zh_CN"
        var firstWeekday: Int
        var gridFirstWeekday = 1 // The app consistently uses Sunday–Saturday columns.
        var minimumDaysInFirstWeek: Int
        var platform: String
    }
    private struct Context {
        var configuration: Configuration
        var signature: String
        var calendar: Calendar
    }
    private struct Key: Hashable { var configuration: String; var month: Date }
    private struct Job { var key: Key; var context: Context; var visible: Bool }
    private struct FileRecord: Codable { var configuration: Configuration; var month: Month }
    private final class Box<Value> {
        let value: Value
        init(_ value: Value) { self.value = value }
    }

    // NSCache is thread-safe. Job state is protected by lock; all disk I/O uses worker.
    private let months = NSCache<NSString, Box<Month>>()
    private let days = NSCache<NSString, Box<CourseCalendar.DayPresentation>>()
    private let placeholders = NSCache<NSString, Box<Month>>()
    private let contexts = NSCache<NSString, Box<Context>>()
    private let lock = NSLock()
    private let worker = DispatchQueue(label: "LessonLedger.calendar-date-cache", qos: .utility)
    private var jobs: [Key: Job] = [:]
    private var visibleQueue: [Key] = []
    private var backgroundQueue: [Key] = []
    private var inFlight: Set<Key> = []
    private var running = false
    private var started = false
    private var observers: [NSObjectProtocol] = []
    private var configurationSignature: String?
    private var pendingChanges: Set<Change> = []
    private var notificationScheduled = false
    private let platform = ProcessInfo.processInfo.operatingSystemVersionString

    private init() {
        months.countLimit = 120 // Ten years of month documents; five years fit comfortably.
        days.countLimit = 5_000
        placeholders.countLimit = 24
        contexts.countLimit = 8
    }

    func start() {
        lock.lock()
        guard !started else { lock.unlock(); return }
        started = true
        lock.unlock()
        prewarm()
        for name in [Notification.Name.NSCalendarDayChanged, .NSSystemTimeZoneDidChange, NSLocale.currentLocaleDidChangeNotification] {
            let observer = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.prewarm()
            }
            observers.append(observer)
        }
    }

    func configurationID(calendar: Calendar = .current) -> String { context(for: calendar).signature }

    /// Queue current month first, the rest of this year next, then the nearest other years.
    func prewarm(now: Date = Date(), calendar: Calendar = .current) {
        let context = context(for: calendar)
        lock.lock()
        let changed = configurationSignature != nil && configurationSignature != context.signature
        configurationSignature = context.signature
        lock.unlock()
        if changed {
            DispatchQueue.main.async { NotificationCenter.default.post(name: Self.didChangeConfiguration, object: nil) }
        }
        enqueue(now, context: context, visible: true)
        let year = calendar.dateInterval(of: .year, for: now)!.start
        for offset in [0, -1, 1, -2, 2] {
            let start = calendar.date(byAdding: .year, value: offset, to: year)!
            for month in yearMonths(containing: start, calendar: calendar) {
                enqueue(month, context: context, visible: false)
            }
        }
    }

    /// Used at month/year boundaries, not on every scroll-pixel callback.
    func prefetch(around date: Date, wholeYear: Bool = false, calendar: Calendar = .current) {
        let context = context(for: calendar)
        enqueue(date, context: context, visible: true)
        if wholeYear {
            for month in yearMonths(containing: date, calendar: calendar) {
                enqueue(month, context: context, visible: true)
            }
        }
        for offset in [-1, 1, -2, 2] {
            if let month = calendar.date(byAdding: .month, value: offset, to: date) {
                enqueue(month, context: context, visible: false)
            }
        }
        // Approaching a year boundary prepares that adjacent year before it is entered.
        let year = calendar.dateInterval(of: .year, for: date)!
        let monthOffset = calendar.dateComponents([.month], from: year.start, to: date).month ?? 0
        let nextYear: Date?
        if monthOffset < 2 { nextYear = calendar.date(byAdding: .year, value: -1, to: year.start) }
        else if monthOffset >= 10 { nextYear = year.end }
        else { nextYear = nil }
        if let nextYear {
            for month in yearMonths(containing: nextYear, calendar: calendar) {
                enqueue(month, context: context, visible: false)
            }
        }
    }

    func day(_ date: Date, calendar: Calendar = .current) -> CourseCalendar.DayPresentation {
        let context = context(for: calendar)
        let day = calendar.startOfDay(for: date)
        let key = objectKey(context.signature, day)
        if let cached = days.object(forKey: key) { return cached.value }
        let value = month(day, calendar: calendar)
        return value.days.first(where: { $0.date == day }) ?? basicDay(day, calendar: calendar)
    }

    func month(_ date: Date, calendar: Calendar = .current) -> Month {
        let context = context(for: calendar)
        let start = calendar.dateInterval(of: .month, for: date)!.start
        let key = objectKey(context.signature, start)
        if let cached = months.object(forKey: key) { return cached.value }
        enqueue(start, context: context, visible: true)
        if let cached = placeholders.object(forKey: key) { return cached.value }
        // No disk access or lunar calculation on a rendering/cache-miss path.
        let value = buildMonth(start, calendar: calendar, includeLunar: false)
        placeholders.setObject(Box(value), forKey: key)
        return value
    }

    func yearMonths(containing date: Date, calendar: Calendar = .current) -> [Date] {
        let interval = calendar.dateInterval(of: .year, for: date)!
        var values: [Date] = []
        var cursor = interval.start
        while cursor < interval.end {
            values.append(cursor)
            guard let next = calendar.date(byAdding: .month, value: 1, to: cursor), next > cursor else { break }
            cursor = next
        }
        return values
    }

    private func context(for calendar: Calendar) -> Context {
        let configuration = Configuration(calendar: String(describing: calendar.identifier), timeZone: calendar.timeZone.identifier,
                                          firstWeekday: calendar.firstWeekday, minimumDaysInFirstWeek: calendar.minimumDaysInFirstWeek,
                                          platform: platform)
        let raw = "\(configuration.version)|\(configuration.calendar)|\(configuration.timeZone)|\(configuration.locale)|\(configuration.firstWeekday)|\(configuration.gridFirstWeekday)|\(configuration.minimumDaysInFirstWeek)|\(platform)"
        if let cached = contexts.object(forKey: raw as NSString) { return cached.value }
        let signature = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        let value = Context(configuration: configuration, signature: signature, calendar: calendar)
        contexts.setObject(Box(value), forKey: raw as NSString)
        return value
    }

    private func objectKey(_ signature: String, _ date: Date) -> NSString {
        "\(signature)|\(Int64(date.timeIntervalSince1970))" as NSString
    }

    private func enqueue(_ date: Date, context: Context, visible: Bool) {
        let start = context.calendar.dateInterval(of: .month, for: date)!.start
        let key = Key(configuration: context.signature, month: start)
        if months.object(forKey: objectKey(key.configuration, start)) != nil { return }
        lock.lock()
        if months.object(forKey: objectKey(key.configuration, start)) != nil { lock.unlock(); return }
        if inFlight.contains(key) { lock.unlock(); return }
        if var existing = jobs[key] {
            if visible && !existing.visible {
                existing.visible = true
                jobs[key] = existing
                visibleQueue.append(key)
            }
        } else {
            jobs[key] = Job(key: key, context: context, visible: visible)
            if visible { visibleQueue.append(key) } else { backgroundQueue.append(key) }
        }
        if !running {
            running = true
            worker.async { [weak self] in self?.drain() }
        }
        lock.unlock()
    }

    private func nextJob() -> Job? {
        lock.lock()
        defer { lock.unlock() }
        while !visibleQueue.isEmpty {
            let key = visibleQueue.removeFirst()
            if let job = jobs.removeValue(forKey: key) { inFlight.insert(key); return job }
        }
        while !backgroundQueue.isEmpty {
            let key = backgroundQueue.removeFirst()
            if let job = jobs.removeValue(forKey: key) { inFlight.insert(key); return job }
        }
        running = false
        return nil
    }

    private func drain() {
        while let job = nextJob() {
            autoreleasepool { loadOrBuild(job) }
            lock.lock()
            inFlight.remove(job.key)
            lock.unlock()
        }
        pruneDiskCache()
    }

    private func loadOrBuild(_ job: Job) {
        let url = fileURL(job)
        var value: Month?
        if let url, let data = try? Data(contentsOf: url),
           let file = try? JSONDecoder().decode(FileRecord.self, from: data),
           file.configuration == job.context.configuration,
           file.month.start == job.key.month, file.month.end > file.month.start,
           file.month.days.count == 42, file.month.gridCount >= 7, file.month.gridCount <= 42,
           file.month.gridCount.isMultiple(of: 7), file.month.yearMonths.contains(file.month.start),
           Set(file.month.days.map(\.date)).count == 42,
           file.month.days.first?.date == CourseCalendar.weekStart(for: job.key.month, calendar: job.context.calendar) {
            value = file.month
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
        }
        let month = value ?? buildMonth(job.key.month, calendar: job.context.calendar, includeLunar: true)
        if value == nil, let url, let data = try? JSONEncoder().encode(FileRecord(configuration: job.context.configuration, month: month)) {
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: url, options: .atomic)
            } catch {
                // Cache persistence is optional; computed dates remain available in memory.
                NSLog("Calendar date cache write failed: %@", error.localizedDescription)
            }
        }
        months.setObject(Box(month), forKey: objectKey(job.context.signature, month.start))
        placeholders.removeObject(forKey: objectKey(job.context.signature, month.start))
        for day in month.days { days.setObject(Box(day), forKey: objectKey(job.context.signature, day.date)) }
        let end = job.context.calendar.date(byAdding: .day, value: 1, to: month.days.last!.date)!
        publish(Change(configuration: job.context.signature, start: month.days[0].date, end: end))
    }

    private func buildMonth(_ date: Date, calendar: Calendar, includeLunar: Bool) -> Month {
        let interval = calendar.dateInterval(of: .month, for: date)!
        let firstWeek = CourseCalendar.weekStart(for: interval.start, calendar: calendar)
        let leading = calendar.dateComponents([.day], from: firstWeek, to: interval.start).day!
        let count = calendar.range(of: .day, in: .month, for: date)!.count
        var chinese = Calendar(identifier: .chinese)
        chinese.timeZone = calendar.timeZone
        // These formatters are local to this build and never cross worker/UI threads.
        let lunarMonth: DateFormatter?
        if includeLunar {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "zh_CN")
            formatter.calendar = chinese
            formatter.timeZone = calendar.timeZone
            formatter.dateFormat = "MMMM"
            lunarMonth = formatter
        } else { lunarMonth = nil }
        let records = (0..<42).map { offset -> CourseCalendar.DayPresentation in
            let day = calendar.date(byAdding: .day, value: offset, to: firstWeek)!
            var info = basicDay(day, calendar: calendar)
            if includeLunar {
                let lunarDay = chinese.component(.day, from: day)
                info.lunar = lunarDay == 1 ? lunarMonth!.string(from: day) : Self.lunarDays[max(0, min(29, lunarDay - 1))]
            }
            return info
        }
        return Month(start: interval.start, end: interval.end, yearStart: calendar.dateInterval(of: .year, for: date)!.start,
                     yearMonths: yearMonths(containing: date, calendar: calendar), title: "\(calendar.component(.month, from: date))月",
                     gridCount: ((leading + count + 6) / 7) * 7, days: records)
    }

    private func basicDay(_ date: Date, calendar: Calendar) -> CourseCalendar.DayPresentation {
        let number = calendar.component(.day, from: date)
        let weekday = calendar.component(.weekday, from: date)
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        return CourseCalendar.DayPresentation(
            date: date, month: calendar.dateInterval(of: .month, for: date)!.start,
            title: number == 1 ? "\(calendar.component(.month, from: date))月1日" : "\(number)", lunar: "",
            accessibility: String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!),
            isWeekend: calendar.isDateInWeekend(date), number: number,
            weekdayTitle: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][weekday - 1]
        )
    }

    private static let lunarDays = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
                                    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
                                    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"]

    private var rootURL: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("LessonLedger/CalendarDates-v1", isDirectory: true)
    }
    private func fileURL(_ job: Job) -> URL? {
        rootURL?.appendingPathComponent(job.context.signature, isDirectory: true)
            .appendingPathComponent("\(Int64(job.key.month.timeIntervalSince1970)).json")
    }
    private func pruneDiskCache() {
        guard let rootURL, let enumerator = FileManager.default.enumerator(at: rootURL,
                includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey], options: [.skipsHiddenFiles]) else { return }
        var files: [(URL, Date)] = []
        for case let url as URL in enumerator where url.pathExtension == "json" {
            guard let info = try? url.resourceValues(forKeys: [.contentModificationDateKey, .isRegularFileKey]), info.isRegularFile == true else { continue }
            files.append((url, info.contentModificationDate ?? .distantPast))
        }
        // At most 240 month files across configurations; only our rebuildable cache is pruned.
        if files.count > 240 {
            for (url, _) in files.sorted(by: { $0.1 < $1.1 }).prefix(files.count - 240) { try? FileManager.default.removeItem(at: url) }
        }
    }

    private func publish(_ change: Change) {
        lock.lock()
        pendingChanges.insert(change)
        let schedule = !notificationScheduled
        notificationScheduled = true
        lock.unlock()
        guard schedule else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let changes = self.pendingChanges
            self.pendingChanges.removeAll()
            self.notificationScheduled = false
            self.lock.unlock()
            NotificationCenter.default.post(name: Self.didLoadMonths, object: changes)
        }
    }
}
