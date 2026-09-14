import Foundation

public enum ThreadlineLink {
    public static func destination(_ url: URL) -> URL? {
        guard url.scheme == "threadline", url.host == "collect", url.user == nil,
              url.password == nil, url.port == nil, url.query == nil, url.fragment == nil else { return nil }
        let parts = url.path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].isEmpty,
              ["codex", "cursor", "claude", "pi", "deepseek"].contains(String(parts[1])),
              String(parts[2]).range(of: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$", options: .regularExpression) != nil else { return nil }
        return URL(string: "http://127.0.0.1:43127/collect/\(parts[1])/\(parts[2])?native=1")
    }
}
