import Foundation
import CryptoKit

/// The app bundle pins the runtime URL and digest. No executable is resolved from PATH.
public enum ManagedNode {
    public struct Archive: Codable { public let url: String; public let sha256: String }
    public struct Manifest: Codable { public let version: String; public let archives: [String: Archive] }
    public static func digest(_ file: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let data = try handle.read(upToCount: 1024 * 1024), !data.isEmpty { hash.update(data: data) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
    public static func validate(_ manifest: Manifest, architecture: String) throws -> Archive {
        guard manifest.version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil,
              let archive = manifest.archives[architecture],
              let url = URL(string: archive.url), url.scheme == "https", url.host == "nodejs.org",
              url.path == "/dist/v\(manifest.version)/node-v\(manifest.version)-darwin-\(architecture).tar.gz",
              archive.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw NSError(domain: "Threadline", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid bundled runtime configuration"])
        }
        return archive
    }
    @discardableResult public static func run(_ executable: String, _ arguments: [String]) throws -> Data {
        let process = Process(), pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
        process.standardOutput = pipe; process.standardError = pipe
        try process.run()
        let output = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw NSError(domain: "Threadline", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: String(data: output.suffix(3000), encoding: .utf8) ?? "Component preparation failed"])
        }
        return output
    }
    public static func prepare(root: URL, manifestURL: URL, progress: (String) -> Void) throws -> URL {
        let fm = FileManager.default
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: manifestURL))
        #if arch(arm64)
        let architecture = "arm64"
        #else
        let architecture = "x64"
        #endif
        let archive = try validate(manifest, architecture: architecture)
        let folder = root.appendingPathComponent("node/\(manifest.version)-\(architecture)")
        let node = folder.appendingPathComponent("bin/node")
        let receipt = folder.appendingPathComponent("binary.sha256")
        if fm.isExecutableFile(atPath: node.path), let expected = try? String(contentsOf: receipt, encoding: .utf8),
           try digest(node) == expected { return node }
        let downloads = root.appendingPathComponent("downloads")
        try fm.createDirectory(at: downloads, withIntermediateDirectories: true)
        let cached = downloads.appendingPathComponent("node-\(manifest.version)-\(architecture).tar.gz")
        if try !fm.fileExists(atPath: cached.path) || digest(cached) != archive.sha256 {
            progress("正在下载运行环境，失败后可重试并续传")
            // System curl follows HTTPS-only redirects and resumes interrupted transfers.
            let arguments = ["--fail", "--location", "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "20", "--max-time", "600", "--max-filesize", "150000000", "--retry", "2", "--continue-at", "-", "--output", cached.path, archive.url]
            do { try run("/usr/bin/curl", arguments) }
            catch {
                let failure = error as NSError
                // Servers can reject Range, or a corrupt complete cache can yield 416.
                guard failure.code == 33 || failure.localizedDescription.contains("416") else { throw error }
                try? fm.removeItem(at: cached)
                try run("/usr/bin/curl", arguments)
            }
            guard try digest(cached) == archive.sha256 else {
                try? fm.removeItem(at: cached)
                throw NSError(domain: "Threadline", code: 2, userInfo: [NSLocalizedDescriptionKey: "运行环境校验失败，请重试"])
            }
        }
        progress("正在安装运行环境")
        let staging = root.appendingPathComponent("node/staging-\(UUID().uuidString)")
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: staging) }
        let prefix = "node-v\(manifest.version)-darwin-\(architecture)"
        try run("/usr/bin/tar", ["-xzf", cached.path, "-C", staging.path, "--strip-components", "1", "\(prefix)/bin/node", "\(prefix)/LICENSE"])
        let binary = staging.appendingPathComponent("bin/node")
        let output = try run(binary.path, ["-e", "require('node:sqlite');process.stdout.write(process.versions.node)"])
        guard String(data: output, encoding: .utf8)?.hasPrefix(manifest.version) == true else {
            throw NSError(domain: "Threadline", code: 3, userInfo: [NSLocalizedDescriptionKey: "运行环境版本不匹配"])
        }
        try digest(binary).write(to: staging.appendingPathComponent("binary.sha256"), atomically: true, encoding: .utf8)
        if fm.fileExists(atPath: folder.path) { try fm.removeItem(at: folder) }
        try fm.moveItem(at: staging, to: folder)
        try? fm.removeItem(at: cached)
        return node
    }
}
