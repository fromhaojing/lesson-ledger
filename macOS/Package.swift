// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LessonLedger",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "LessonLedger", targets: ["LessonLedger"])],
    targets: [
        .systemLibrary(name: "CSQLite"),
        .executableTarget(name: "LessonLedger", dependencies: ["CSQLite"], resources: [.process("Resources")]),
        .testTarget(name: "LessonLedgerTests", dependencies: ["LessonLedger"], resources: [.copy("Fixtures")])
    ]
)
