// swift-tools-version: 5.9
// Native macOS shell (Milestone 8, in progress). Compiled and tested by the
// macOS CI job; workflow logic lives in the portable service (ADR-0002).
import PackageDescription

let package = Package(
    name: "ClaimWorkbench",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "ClaimWorkbench",
            path: "Sources/ClaimWorkbench"
        ),
        .testTarget(
            name: "ClaimWorkbenchTests",
            dependencies: ["ClaimWorkbench"],
            path: "Tests/ClaimWorkbenchTests"
        )
    ]
)
