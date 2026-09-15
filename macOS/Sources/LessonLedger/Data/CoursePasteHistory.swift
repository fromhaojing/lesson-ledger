import Foundation

/// Session-local history of inserted copies. Source courses and unrelated edits
/// never enter this history, so undo can only remove a course created by paste.
struct CoursePasteHistory {
    private(set) var ids: [String] = []
    var canUndo: Bool { !ids.isEmpty }

    mutating func record(_ id: String) { ids.append(id) }
    mutating func reconcile(existingIDs: Set<String>) { ids.removeAll { !existingIDs.contains($0) } }

    mutating func undo(in database: Database) throws {
        guard let id = ids.last else { return }
        try database.transaction {
            guard !(try database.rows("SELECT id FROM lesson WHERE id=? AND deleted_at IS NULL", [id])).isEmpty else {
                throw LedgerError.message("这节粘贴的课程已不存在。")
            }
            try database.remove(id)
        }
        ids.removeLast()
    }
}
