import XCTest
@testable import RewindCore

final class LibraryTests: XCTestCase {
    func temporaryFolder() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

    func testPersistenceSearchAndDelete() throws {
        let folder = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let library = try Library(directory: folder)
        var clip = Clip(body: "# 权限架构\n按团队隔离", source: "Cursor")
        clip.note = "准备实现"
        try library.put(clip)
        let reloaded = try Library(directory: folder)
        XCTAssertEqual(reloaded.clips, [clip])
        XCTAssertTrue(clip.matches("CURSOR 团队"))
        XCTAssertTrue(clip.matches("准备"))
        XCTAssertFalse(clip.matches("团队 missing"))
        try reloaded.remove(clip.id)
        XCTAssertTrue(try Library(directory: folder).clips.isEmpty)
    }

    func testExportRetainsCodeAndImage() throws {
        let folder = temporaryFolder()
        let output = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder); try? FileManager.default.removeItem(at: output) }
        let library = try Library(directory: folder)
        let bytes = Data([1, 2, 3])
        let image = try library.saveImage(bytes)
        var clip = Clip(body: "```swift\nlet x = 1\n```", source: "Codex", attachment: image)
        clip.title = "架构 / A:B"
        clip.question = "怎么隔离？"
        try library.put(clip)
        try library.export([clip], to: output)
        let markdown = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: output, includingPropertiesForKeys: nil).first { $0.pathExtension == "md" })
        let text = try String(contentsOf: markdown)
        XCTAssertTrue(text.contains(clip.body))
        XCTAssertTrue(text.contains("attachments/\(image)"))
        XCTAssertEqual(try Data(contentsOf: output.appendingPathComponent("attachments/\(image)")), bytes)
        XCTAssertTrue(clip.context.contains(clip.question))
        XCTAssertTrue(clip.context.contains("另行附上"))
    }

    func testCorruptLibraryIsNotSilentlyReplaced() throws {
        let folder = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("library.json")
        try Data("broken".utf8).write(to: file)
        XCTAssertThrowsError(try Library(directory: folder))
        XCTAssertEqual(try String(contentsOf: file), "broken")
    }

    func testFailedWriteDoesNotPublishUnsavedChanges() throws {
        let folder = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let library = try Library(directory: folder)
        var clip = Clip(body: "original", source: "test")
        try library.put(clip)
        let file = folder.appendingPathComponent("library.json")
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        clip.body = "not saved"
        XCTAssertThrowsError(try library.put(clip))
        XCTAssertEqual(library.clips.first?.body, "original")
    }

    func testExportLongUnicodeTitleFitsFilesystem() throws {
        let folder = temporaryFolder()
        let output = temporaryFolder()
        defer { try? FileManager.default.removeItem(at: folder); try? FileManager.default.removeItem(at: output) }
        let library = try Library(directory: folder)
        var clip = Clip(body: "retained", source: "test")
        clip.title = String(repeating: "👩🏽‍💻", count: 80)
        try library.export([clip], to: output)
        let files = try FileManager.default.contentsOfDirectory(at: output, includingPropertiesForKeys: nil)
        XCTAssertEqual(files.count, 1)
        XCTAssertLessThan(files[0].lastPathComponent.utf8.count, 255)
        XCTAssertTrue(try String(contentsOf: files[0]).contains(clip.title))
    }
}
