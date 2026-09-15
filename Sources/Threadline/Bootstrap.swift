import AppKit
import RewindCore
import Darwin

final class Bootstrap: NSObject {
    private var busy = false
    private var overlay: PreparationView?
    private let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/RewindWeb")
    func prepare(in window: NSWindow, completion: @escaping ([String: Any]) -> Void) {
        guard !busy else { return }
        busy = true
        let surface = PreparationView(updating: false)
        if let parent = window.contentView { surface.attach(to: parent) }
        overlay = surface
        let progressFile = root.appendingPathComponent("progress-\(UUID().uuidString).json")
        surface.observe(progressFile)
        let root = self.root
        DispatchQueue.global(qos: .userInitiated).async {
            let result: Result<[String: Any], Error> = Result(catching: {
                try self.install(root: root, progressFile: progressFile, progress: { stage, received, total in
                    DispatchQueue.main.async { surface.setProgress(stage: stage, received: received, total: total) }
                })
            })
            DispatchQueue.main.async {
                try? FileManager.default.removeItem(at: progressFile)
                self.finish(result, window: window, completion: completion)
            }
        }
    }
    private func finish(_ result: Result<[String: Any], Error>, window: NSWindow, completion: @escaping ([String: Any]) -> Void) {
        busy = false
        switch result {
        case .success(let value):
            overlay?.stopObserving(); overlay?.setProgress(stage: "done")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                self.overlay?.removeFromSuperview(); self.overlay = nil; completion(value)
            }
        case .failure(let error):
            try? error.localizedDescription.write(to: root.appendingPathComponent("bootstrap-error.log"), atomically: true, encoding: .utf8)
            overlay?.fail("请检查网络后重试，笔记和设置仍保存在本机") { [weak self, weak window] in
                guard let self, let window else { return }
                self.overlay?.removeFromSuperview(); self.prepare(in: window, completion: completion)
            }
        }
    }
    private func install(root: URL, progressFile: URL, progress: @escaping (String, Double, Double) -> Void) throws -> [String: Any] {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let descriptor = open(root.appendingPathComponent("bootstrap.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw NSError(domain: "Threadline", code: 1) }
        defer { flock(descriptor, LOCK_UN); close(descriptor) }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { throw NSError(domain: "Threadline", code: 2, userInfo: [NSLocalizedDescriptionKey: "另一个 Threadline 正在准备组件，请稍后重试"]) }
        guard let manifest = Bundle.main.url(forResource: "node-runtime", withExtension: "json"),
              let config = Bundle.main.url(forResource: "update-config", withExtension: "json"),
              let cli = Bundle.main.url(forResource: "cli", withExtension: "mjs", subdirectory: "updater") else { throw NSError(domain: "Threadline", code: 3, userInfo: [NSLocalizedDescriptionKey: "安装包缺少组件配置，请重新下载应用"]) }
        let node = try ManagedNode.prepare(root: root, manifestURL: manifest, transfer: { received, total in progress("runtime", received, total) }) { _ in
            progress("runtime", 0, 0)
        }
        progress("features", 0, 0)
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        let data = try ManagedNode.run(node.path, [cli.path, "prepare", root.path, config.path, build, "", progressFile.path])
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any], value["state"] as? String == "ready" else { throw NSError(domain: "Threadline", code: 4, userInfo: [NSLocalizedDescriptionKey: "组件准备未完成，请重试"]) }
        return value
    }
}
