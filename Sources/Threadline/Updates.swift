import AppKit
import WebKit
import Sparkle

/// Native code owns installation; web content can only request fixed actions.
final class Updates {
    weak var web: WKWebView?
    private var sparkle: SPUStandardUpdaterController?
    private var timer: Timer?
    private var busy = false
    private var state: [String: Any] = ["state": "idle"]
    private let defaults = UserDefaults.standard
    private let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/RewindWeb")
    private var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0" }
    private var configured: Bool {
        guard let url = Bundle.main.url(forResource: "update-config", withExtension: "json"),
              let data = try? Data(contentsOf: url), let value = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return false }
        return !(value["feedURL"] ?? "").isEmpty && !(value["publicKey"] ?? "").isEmpty
    }
    init() {
        if let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String, URL(string: feed)?.scheme == "https",
           let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String, !key.isEmpty {
            sparkle = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
            sparkle?.updater.automaticallyChecksForUpdates = defaults.bool(forKey: "threadline-auto-updates")
        }
        timer = Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in self?.automaticCheck() }
    }
    func automaticCheck() {
        guard defaults.bool(forKey: "threadline-auto-updates"), configured,
              Date().timeIntervalSince1970 - defaults.double(forKey: "threadline-last-update-check") >= 86400 else { return }
        run("check")
    }
    func handle(_ body: [String: Any]) {
        switch body["action"] as? String {
        case "status": if !busy && state["version"] == nil { run("status") } else { publish() }
        case "check":
            guard !busy else { return }
            run("check", checkShell: true)
        case "install":
            guard !busy, state["state"] as? String == "available",
                  let release = state["release"] as? [String: Any], let version = release["version"] as? String else { return }
            run("install", version: version)
        case "automatic":
            guard let enabled = body["enabled"] as? Bool else { return }
            defaults.set(enabled, forKey: "threadline-auto-updates")
            sparkle?.updater.automaticallyChecksForUpdates = enabled
            publish(); automaticCheck()
        case "openData": NSWorkspace.shared.open(root)
        default: break
        }
    }
    private func publish() {
        var value = state
        value["nativeVersion"] = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        value["nativeBuild"] = build
        value["configured"] = configured || sparkle != nil
        value["automatic"] = defaults.bool(forKey: "threadline-auto-updates")
        value["lastChecked"] = defaults.double(forKey: "threadline-last-update-check")
        guard let bytes = try? JSONSerialization.data(withJSONObject: value), let json = String(data: bytes, encoding: .utf8) else { return }
        web?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('threadline-updates', {detail: \(json)}))")
    }
    private func run(_ command: String, version: String = "", checkShell: Bool = false) {
        guard !busy else { return }
        guard let script = Bundle.main.url(forResource: "cli", withExtension: "mjs", subdirectory: "updater"),
              let config = Bundle.main.url(forResource: "update-config", withExtension: "json"),
              let plist = NSDictionary(contentsOf: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/local.rewind.web.plist")),
              let args = plist["ProgramArguments"] as? [String], let node = args.first, node.hasPrefix("/") else {
            state["state"] = "unconfigured"; publish(); return
        }
        busy = true
        state["state"] = command == "install" ? "installing" : command == "check" ? "checking" : "loading"
        publish()
        let arguments = [script.path, command, root.path, config.path, build, version]
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process(), pipe = Pipe()
            process.executableURL = URL(fileURLWithPath: node); process.arguments = arguments
            process.standardOutput = pipe
            var result: [String: Any]
            do {
                try process.run()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? ["state": "error", "error": "Invalid update response"]
            } catch { result = ["state": "error", "error": error.localizedDescription] }
            let response = result
            DispatchQueue.main.async {
                self.busy = false
                if let oldVersion = self.state["version"], response["version"] == nil { self.state = response; self.state["version"] = oldVersion }
                else { self.state = response }
                if command == "check", ["current", "available", "incompatible"].contains(response["state"] as? String ?? "") {
                    self.defaults.set(Date().timeIntervalSince1970, forKey: "threadline-last-update-check")
                }
                if checkShell && response["state"] as? String == "unconfigured" && self.sparkle != nil { self.state["state"] = "shell" }
                self.publish()
                if checkShell { self.sparkle?.checkForUpdates(nil) }
                if response["state"] as? String == "installed" { self.web?.reload() }
            }
        }
    }
}
