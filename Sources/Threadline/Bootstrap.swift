import AppKit
import RewindCore
import Darwin

final class Bootstrap: NSObject {
    private var busy = false
    private var overlay: NSView?
    private let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/RewindWeb")
    func prepare(in window: NSWindow, completion: @escaping ([String: Any]) -> Void) {
        guard !busy else { return }
        busy = true
        let surface = NSView(); surface.wantsLayer = true
        surface.layer?.backgroundColor = NSColor(calibratedRed: 0.98, green: 0.985, blue: 0.97, alpha: 1).cgColor
        let title = NSTextField(labelWithString: "正在准备 Threadline")
        title.font = .systemFont(ofSize: 20, weight: .medium)
        let detail = NSTextField(wrappingLabelWithString: "首次打开需要下载运行组件，完成后可离线使用")
        detail.alignment = .center
        let spinner = NSProgressIndicator(); spinner.style = .spinning; spinner.startAnimation(nil)
        let stack = NSStackView(views: [title, detail, spinner]); stack.orientation = .vertical; stack.spacing = 18
        surface.addSubview(stack); window.contentView?.addSubview(surface)
        surface.translatesAutoresizingMaskIntoConstraints = false; stack.translatesAutoresizingMaskIntoConstraints = false
        if let parent = window.contentView {
            NSLayoutConstraint.activate([surface.leadingAnchor.constraint(equalTo: parent.leadingAnchor), surface.trailingAnchor.constraint(equalTo: parent.trailingAnchor), surface.topAnchor.constraint(equalTo: parent.topAnchor), surface.bottomAnchor.constraint(equalTo: parent.bottomAnchor), stack.centerXAnchor.constraint(equalTo: surface.centerXAnchor), stack.centerYAnchor.constraint(equalTo: surface.centerYAnchor), stack.widthAnchor.constraint(lessThanOrEqualToConstant: 460)])
        }
        overlay = surface
        let root = self.root
        DispatchQueue.global(qos: .userInitiated).async {
            let result: Result<[String: Any], Error> = Result(catching: {
                try self.install(root: root, progress: { message in
                    DispatchQueue.main.async { detail.stringValue = message }
                })
            })
            DispatchQueue.main.async {
                self.finish(result, window: window, title: title, detail: detail, spinner: spinner, stack: stack, completion: completion)
            }
        }
    }
    private func finish(_ result: Result<[String: Any], Error>, window: NSWindow, title: NSTextField, detail: NSTextField, spinner: NSProgressIndicator, stack: NSStackView, completion: @escaping ([String: Any]) -> Void) {
        busy = false
        switch result {
        case .success(let value):
            overlay?.removeFromSuperview(); overlay = nil; completion(value)
        case .failure(let error):
            spinner.stopAnimation(nil); spinner.isHidden = true; title.stringValue = "暂时无法完成准备"
            try? error.localizedDescription.write(to: root.appendingPathComponent("bootstrap-error.log"), atomically: true, encoding: .utf8)
            let message = error.localizedDescription.contains("compatible feature package") ? "暂未找到与此应用匹配的功能包，请稍后重试" : "组件下载或启动未完成，请检查网络后重试"
            detail.stringValue = "\(message)\n笔记和设置仍保存在本机"
            let button = NSButton(title: "重试", target: self, action: #selector(retry))
            button.bezelStyle = .rounded
            retryCallback = { [weak self, weak window] in
                guard let self, let window else { return }
                self.overlay?.removeFromSuperview()
                self.prepare(in: window, completion: completion)
            }
            stack.addArrangedSubview(button)
        }
    }
    @objc private func retry() { retryCallback?() }
    private var retryCallback: (() -> Void)?
    private func install(root: URL, progress: @escaping (String) -> Void) throws -> [String: Any] {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let descriptor = open(root.appendingPathComponent("bootstrap.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw NSError(domain: "Threadline", code: 1) }
        defer { flock(descriptor, LOCK_UN); close(descriptor) }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { throw NSError(domain: "Threadline", code: 2, userInfo: [NSLocalizedDescriptionKey: "另一个 Threadline 正在准备组件，请稍后重试"]) }
        guard let manifest = Bundle.main.url(forResource: "node-runtime", withExtension: "json"),
              let config = Bundle.main.url(forResource: "update-config", withExtension: "json"),
              let cli = Bundle.main.url(forResource: "cli", withExtension: "mjs", subdirectory: "updater") else { throw NSError(domain: "Threadline", code: 3, userInfo: [NSLocalizedDescriptionKey: "安装包缺少组件配置，请重新下载应用"]) }
        let node = try ManagedNode.prepare(root: root, manifestURL: manifest) { message in
            progress(message)
        }
        progress("正在准备界面与本地服务，已有组件将直接复用")
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        let data = try ManagedNode.run(node.path, [cli.path, "prepare", root.path, config.path, build])
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any], value["state"] as? String == "ready" else { throw NSError(domain: "Threadline", code: 4, userInfo: [NSLocalizedDescriptionKey: "组件准备未完成，请重试"]) }
        return value
    }
}
