import XCTest
@testable import RewindCore

final class ThreadlineLinkTests: XCTestCase {
    func testExactLocalConversation() {
        for runtime in ["codex", "cursor", "claude", "pi", "deepseek"] {
            let url = URL(string: "threadline://collect/\(runtime)/session-123")!
            XCTAssertEqual(ThreadlineLink.destination(url)?.absoluteString, "http://127.0.0.1:43127/collect/\(runtime)/session-123?native=1")
        }
    }
    func testRejectsUntrustedOrAmbiguousTargets() {
        for text in ["https://collect/pi/id", "threadline://other/pi/id", "threadline://collect/unknown/id", "threadline://collect/pi/id?url=https://example.com", "threadline://collect/pi/..", "threadline://collect/pi/a%2Fb", "threadline://user@collect/pi/id", "threadline://collect:80/pi/id", "threadline://collect/pi/id/extra"] {
            XCTAssertNil(ThreadlineLink.destination(URL(string: text)!), text)
        }
    }
}
