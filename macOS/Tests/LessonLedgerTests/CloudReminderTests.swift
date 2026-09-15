import XCTest
@testable import LessonLedger

private actor FakeCloudReminderAPI: CloudReminderAPI {
    var reminders: [CloudQueuedReminder]
    var created = 0
    var cancelled = 0
    var reads = 0
    let offline: Bool
    let settling: Bool
    let failAfter: Int?
    init(_ reminders: [CloudQueuedReminder] = [], offline: Bool = false, settling: Bool = false, failAfter: Int? = nil) {
        self.reminders = reminders; self.offline = offline; self.settling = settling; self.failAfter = failAfter
    }
    func queue() async throws -> CloudReminderQueue {
        reads += 1
        if offline { throw CloudReminderFailure.message("offline") }
        return .init(limit: 30, pendingCount: reminders.count, reminders: reminders, settlingRunIds: settling ? ["unconfirmed"] : [])
    }
    func schedule(_ r: CloudReminderRequest) async throws -> CloudReminderReceipt {
        if failAfter == created { throw CloudReminderFailure.message("unconfirmed") }
        guard reminders.count < 30 else { throw CloudReminderFailure.message("capacity exceeded") }
        created += 1
        let id = "wrun_test_\(created)_\(r.occurrenceId)"
        reminders.append(.init(runId: id, occurrenceId: r.occurrenceId, title: r.title, body: r.body, endAt: r.endAt, revision: r.revision, dryRun: r.dryRun))
        return .init(runId: id)
    }
    func cancel(_ runId: String) async throws { cancelled += 1; reminders.removeAll { $0.runId == runId } }
    func stats() -> (created: Int, cancelled: Int, reads: Int, count: Int) { (created, cancelled, reads, reminders.count) }
}

final class CloudReminderTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 2_000_000_000)
    private func candidate(_ id: Int, minutes: Int? = nil) -> CloudReminderRequest {
        .init(occurrenceId: "lesson-\(id)", title: "课程结束提醒", body: "课程已结束", endAt: LedgerDate.iso(now.addingTimeInterval(Double(minutes ?? id) * 60 + 60)), revision: 1, dryRun: false)
    }
    private func queued(_ r: CloudReminderRequest, run: String? = nil) -> CloudQueuedReminder {
        .init(runId: run ?? "wrun_test_\(r.occurrenceId)", occurrenceId: r.occurrenceId, title: r.title, body: r.body, endAt: r.endAt, revision: r.revision, dryRun: r.dryRun)
    }
    func testEmptyQueueChoosesNearest30InStableOrder() {
        let plan = CloudReminderPlan.make(candidates: (0..<45).reversed().map { candidate($0) }, queue: [], enabled: true, now: now)
        XCTAssertEqual(plan.add.map(\.occurrenceId), (0..<30).map { "lesson-\($0)" })
        XCTAssertTrue(plan.cancel.isEmpty)
    }
    func testFullValidQueueIsNotReplacedOrResubmitted() async throws {
        let candidates = (0..<40).map { candidate($0) }
        let api = FakeCloudReminderAPI(candidates.suffix(30).map { queued($0) })
        let result = try await CloudReminderSync.run(api: api, candidates: candidates, enabled: true, now: now)
        XCTAssertEqual(result.waiting, 30)
        let stats = await api.stats()
        XCTAssertEqual(stats.created, 0); XCTAssertEqual(stats.cancelled, 0); XCTAssertEqual(stats.reads, 1)
    }
    func testSevenWaitingAddsExactly23AndSecondOpenDoesNothing() async throws {
        let candidates = (0..<50).map { candidate($0) }
        let api = FakeCloudReminderAPI(candidates.prefix(7).map { queued($0) })
        let first = try await CloudReminderSync.run(api: api, candidates: candidates, enabled: true, now: now)
        let second = try await CloudReminderSync.run(api: api, candidates: candidates, enabled: true, now: now)
        XCTAssertEqual(first.added, 23); XCTAssertEqual(second.added, 0)
        let stats = await api.stats(); XCTAssertEqual(stats.count, 30)
    }
    func testOnlyAvailableFutureLessonsAreAdded() {
        let plan = CloudReminderPlan.make(candidates: [candidate(1), candidate(2), candidate(3, minutes: -10)], queue: [], enabled: true, now: now)
        XCTAssertEqual(plan.add.count, 2)
    }
    func testChangedDeletedAndDuplicateRemindersAreCancelledBeforeRefill() async throws {
        let candidates = [candidate(1, minutes: 50), candidate(2), candidate(3)]
        let api = FakeCloudReminderAPI([queued(candidate(1)), queued(candidate(99)), queued(candidate(2)), queued(candidate(2), run: "wrun_duplicate")])
        let result = try await CloudReminderSync.run(api: api, candidates: candidates, enabled: true, now: now)
        XCTAssertEqual(result.cancelled, 3); XCTAssertEqual(result.added, 2); XCTAssertEqual(result.waiting, 3)
    }
    func testDisablingClearsWaitingReminders() async throws {
        let api = FakeCloudReminderAPI([queued(candidate(1))])
        let result = try await CloudReminderSync.run(api: api, candidates: [candidate(1)], enabled: false, now: now)
        XCTAssertEqual(result.cancelled, 1); XCTAssertEqual(result.added, 0); XCTAssertEqual(result.waiting, 0)
    }
    func testOfflineOrUnconfirmedInventoryNeverCreatesTasks() async {
        for api in [FakeCloudReminderAPI(offline: true), FakeCloudReminderAPI(settling: true)] {
            do { _ = try await CloudReminderSync.run(api: api, candidates: [candidate(1)], enabled: true, now: now); XCTFail("Expected failure") } catch {}
            let stats = await api.stats(); XCTAssertEqual(stats.created, 0)
        }
    }
    func testUnconfirmedPostStopsFurtherSubmissionWithoutBlindRetry() async {
        let api = FakeCloudReminderAPI(failAfter: 2)
        do { _ = try await CloudReminderSync.run(api: api, candidates: (0..<40).map { candidate($0) }, enabled: true, now: now); XCTFail("Expected failure") } catch {}
        let stats = await api.stats(); XCTAssertEqual(stats.created, 2)
    }
    func testLocalCourseDetailsAreNotIncludedInCloudPayload() {
        let lesson = Lesson(id: "id", title: "学生姓名", students: ["学生姓名"], start: now, end: now.addingTimeInterval(3600), grade: "年级", courseType: "类型", defaultAmount: 999, finalAmount: nil, status: .scheduled, note: "私人备注")
        let value = CloudReminderRequest.from(lesson)
        XCTAssertEqual(value.occurrenceId, "id")
        XCTAssertFalse(value.body.contains("学生姓名")); XCTAssertFalse(value.body.contains("999")); XCTAssertFalse(value.body.contains("私人备注"))
    }
}
