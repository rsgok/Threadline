import XCTest
@testable import RewindCore

final class ManagedNodeTests: XCTestCase {
    func testPinnedRuntimeConfigurationRejectsUntrustedURLs() throws {
        func manifest(_ url: String, _ hash: String = String(repeating: "a", count: 64)) throws -> ManagedNode.Manifest {
            let data = try JSONSerialization.data(withJSONObject: ["version": "22.23.2", "archives": ["arm64": ["url": url, "sha256": hash]]])
            return try JSONDecoder().decode(ManagedNode.Manifest.self, from: data)
        }
        let official = "https://nodejs.org/dist/v22.23.2/node-v22.23.2-darwin-arm64.tar.gz"
        XCTAssertNoThrow(try ManagedNode.validate(manifest(official), architecture: "arm64"))
        XCTAssertThrowsError(try ManagedNode.validate(manifest(official.replacingOccurrences(of: "https:", with: "http:")), architecture: "arm64"))
        XCTAssertThrowsError(try ManagedNode.validate(manifest(official.replacingOccurrences(of: "nodejs.org", with: "example.com")), architecture: "arm64"))
        XCTAssertThrowsError(try ManagedNode.validate(manifest(official, "invalid"), architecture: "arm64"))
        XCTAssertThrowsError(try ManagedNode.validate(manifest(official), architecture: "x64"))
    }
    func testStreamingDigest() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        try Data("abc".utf8).write(to: file)
        XCTAssertEqual(try ManagedNode.digest(file), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
    func testRealNodeInstallAndOfflineReuse() throws {
        guard ProcessInfo.processInfo.environment["THREADLINE_TEST_NODE_DOWNLOAD"] == "1" else { throw XCTSkip("Opt in to official runtime download") }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let manifest = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("updater/node-runtime.json")
        let first = try ManagedNode.prepare(root: root, manifestURL: manifest) { print($0) }
        var downloaded = false
        let second = try ManagedNode.prepare(root: root, manifestURL: manifest) { _ in downloaded = true }
        XCTAssertEqual(first, second); XCTAssertFalse(downloaded)
        XCTAssertTrue(FileManager.default.isExecutableFile(atPath: second.path))
    }
}
