import Foundation
import Security

struct CloudReminderRequest: Codable, Equatable, Sendable {
    let occurrenceId: String
    let title: String
    let body: String
    let endAt: String
    let revision: Int
    let dryRun: Bool

    var date: Date { (try? LedgerDate.parseISO(endAt)) ?? .distantPast }

    static func from(_ lesson: Lesson) -> Self {
        // Send no student names, amounts, notes, or grades to the notification service.
        Self(occurrenceId: lesson.id, title: "课程结束提醒",
             body: "\(LedgerDate.time(lesson.end))的课程已结束，请打开钱来确认。",
             endAt: LedgerDate.iso(lesson.end), revision: max(1, Int((lesson.end.timeIntervalSince1970 * 1000).rounded())), dryRun: false)
    }
}

struct CloudQueuedReminder: Decodable, Sendable {
    let runId: String
    let occurrenceId: String
    let title: String
    let body: String?
    let endAt: String
    let revision: Int
    let dryRun: Bool

    func matches(_ desired: CloudReminderRequest) -> Bool {
        occurrenceId == desired.occurrenceId && revision == desired.revision &&
        title == desired.title && body == desired.body && endAt == desired.endAt && dryRun == desired.dryRun
    }
}

struct CloudReminderQueue: Decodable, Sendable {
    let limit: Int
    let pendingCount: Int
    let reminders: [CloudQueuedReminder]
    let settlingRunIds: [String]
}

struct CloudReminderReceipt: Decodable, Sendable { let runId: String }
protocol CloudReminderAPI: Sendable {
    func queue() async throws -> CloudReminderQueue
    func schedule(_ reminder: CloudReminderRequest) async throws -> CloudReminderReceipt
    func cancel(_ runId: String) async throws
}

enum CloudReminderFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}

actor CloudReminderHTTPClient: CloudReminderAPI {
    private let baseURL = URL(string: "https://notify.hjverse.com")!
    private let token: String
    init(token: String) { self.token = token }
    func queue() async throws -> CloudReminderQueue {
        try JSONDecoder().decode(CloudReminderQueue.self, from: await send("api/reminders", method: "GET"))
    }
    func schedule(_ reminder: CloudReminderRequest) async throws -> CloudReminderReceipt {
        try JSONDecoder().decode(CloudReminderReceipt.self, from: await send("api/reminders", method: "POST", body: JSONEncoder().encode(reminder)))
    }
    func cancel(_ runId: String) async throws {
        guard runId.range(of: "^wrun_[A-Za-z0-9_-]{10,100}$", options: .regularExpression) != nil else {
            throw CloudReminderFailure.message("云端任务编号无效，已停止同步。")
        }
        _ = try await send("api/reminders/\(runId)", method: "DELETE", allowFinished: true)
    }
    private func send(_ path: String, method: String, body: Data? = nil, allowFinished: Bool = false) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 35
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body { request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch { throw CloudReminderFailure.message("无法连接提醒服务。请检查网络，稍后重试；本次已停止补充，重试时会先核对云端。") }
        guard let http = response as? HTTPURLResponse else { throw CloudReminderFailure.message("提醒服务返回无效响应。") }
        guard (200..<300).contains(http.statusCode) else {
            let code = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["error"] as? String ?? ""
            if allowFinished && (http.statusCode == 404 || code == "ALREADY_FINISHED") { return data }
            let message: String
            switch code {
            case "UNAUTHORIZED": message = "访问令牌无效，请重新导入连接配置。"
            case "BARK_NOT_CONFIGURED": message = "云端尚未启用 Bark，请检查配置并重新部署。"
            case "QUEUE_FULL": message = "云端已有 30 节待提醒课程，下次打开时会再次检查。"
            case "QUEUE_SETTLING", "ADMISSION_CONFLICT": message = "云端正在确认任务，请稍后再检查。"
            case "SCHEDULE_UNCONFIRMED": message = "任务登记结果尚未确认，已停止补充。下次同步会先从云端核对，避免重复。"
            default: message = "提醒服务暂时不可用（\(http.statusCode)），已停止本次补充。"
            }
            throw CloudReminderFailure.message(message)
        }
        return data
    }
}

struct CloudReminderPlan {
    static let limit = 30
    let cancel: [String]
    let retained: [CloudQueuedReminder]
    let add: [CloudReminderRequest]

    static func make(candidates: [CloudReminderRequest], queue: [CloudQueuedReminder], enabled: Bool, now: Date) -> Self {
        var desired: [String: CloudReminderRequest] = [:]
        if enabled { for item in candidates { desired[item.occurrenceId] = item } }
        var kept: [CloudQueuedReminder] = []
        var cancelled: [String] = []
        var seen = Set<String>()
        for item in queue.sorted(by: { $0.endAt == $1.endAt ? $0.runId < $1.runId : $0.endAt < $1.endAt }) {
            if let wanted = desired[item.occurrenceId], item.matches(wanted),
               kept.count < limit, seen.insert(item.occurrenceId).inserted { kept.append(item) }
            else { cancelled.append(item.runId) }
        }
        // Keep a full, valid queue unchanged, even if new lessons have since been added.
        let upcoming = desired.values.filter { $0.date > now && !seen.contains($0.occurrenceId) }
            .sorted { $0.date == $1.date ? $0.occurrenceId < $1.occurrenceId : $0.date < $1.date }
        return Self(cancel: cancelled, retained: kept, add: Array(upcoming.prefix(max(0, limit - kept.count))))
    }
}

struct CloudReminderSyncResult { let waiting: Int; let added: Int; let cancelled: Int }
enum CloudReminderSync {
    static func run(api: any CloudReminderAPI, candidates: [CloudReminderRequest], enabled: Bool, now: Date = Date()) async throws -> CloudReminderSyncResult {
        var snapshot = try await api.queue()
        try validate(snapshot)
        var plan = CloudReminderPlan.make(candidates: candidates, queue: snapshot.reminders, enabled: enabled, now: now)
        let cancelled = plan.cancel.count
        for id in plan.cancel { try await api.cancel(id) }
        if cancelled > 0 {
            snapshot = try await api.queue()
            try validate(snapshot)
            plan = CloudReminderPlan.make(candidates: candidates, queue: snapshot.reminders, enabled: enabled, now: Date())
            guard plan.cancel.isEmpty else { throw CloudReminderFailure.message("旧提醒仍在取消中，本次不会继续补充。") }
        }
        var added = 0
        for reminder in plan.add {
            guard reminder.date > Date() else { continue }
            _ = try await api.schedule(reminder)
            added += 1
        }
        if added > 0 {
            let finalSnapshot = try await api.queue()
            try validate(finalSnapshot)
            return .init(waiting: finalSnapshot.pendingCount, added: added, cancelled: cancelled)
        }
        return .init(waiting: plan.retained.count, added: added, cancelled: cancelled)
    }
    private static func validate(_ snapshot: CloudReminderQueue) throws {
        guard snapshot.limit == 30, snapshot.pendingCount == snapshot.reminders.count else {
            throw CloudReminderFailure.message("云端队列数据不完整，本次不会创建提醒。")
        }
        guard snapshot.settlingRunIds.isEmpty else {
            throw CloudReminderFailure.message("云端有尚未确认的任务，请稍后再检查；本次不会重复登记。")
        }
    }
}

struct CloudReminderConnection: Decodable {
    let apiToken: String
    func save() throws {
        let token = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard token.count >= 32 else { throw CloudReminderFailure.message("连接配置中的访问令牌无效。") }
        try CloudReminderKeychain.save(token)
    }
}

enum CloudReminderKeychain {
    static let service = "com.lishuo.lesson.mac.cloud-reminders"
    static let account = "reminder-api-token"
    static func read() throws -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
            throw CloudReminderFailure.message("无法读取钥匙串中的提醒令牌，请重新导入连接配置。")
        }
        return token
    }
    static func save(_ token: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        let value = [kSecValueData as String: Data(token.utf8)]
        let updated = SecItemUpdate(query as CFDictionary, value as CFDictionary)
        let status = updated == errSecItemNotFound ? SecItemAdd(query.merging(value) { _, new in new } as CFDictionary, nil) : updated
        guard status == errSecSuccess else { throw CloudReminderFailure.message("无法将访问令牌保存到钥匙串。") }
    }
}
