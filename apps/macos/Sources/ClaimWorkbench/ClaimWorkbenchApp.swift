import SwiftUI

// Placeholder SwiftUI shell. The native application will present packets,
// findings, and recipe-driven actions by driving the portable local service
// over stdio (one JSON message per line, ADR-0002). No workflow logic
// belongs here.

public enum WorkbenchInfo {
    public static let name = "Claim Workbench"
    public static let serviceProtocolVersion = "1"
}

@main
struct ClaimWorkbenchApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text(WorkbenchInfo.name)
                .font(.largeTitle)
            Text("Native shell placeholder. Run the portable prototype with pnpm; the SwiftUI workbench lands in Milestone 8.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(minWidth: 520, minHeight: 340)
    }
}
