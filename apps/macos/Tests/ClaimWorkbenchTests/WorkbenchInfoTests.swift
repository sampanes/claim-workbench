import XCTest
@testable import ClaimWorkbench

final class WorkbenchInfoTests: XCTestCase {
    func testServiceProtocolVersionMatchesTheSharedContract() {
        // The stdio protocol version the native shell will speak must track
        // the portable service's protocol (packages/service/src/stdio.js).
        XCTAssertEqual(WorkbenchInfo.serviceProtocolVersion, "1")
        XCTAssertEqual(WorkbenchInfo.name, "Claim Workbench")
    }
}
