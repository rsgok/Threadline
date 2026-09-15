import AppKit

// Isolated preview of the production view; does not install or touch user data.
@main
struct OnboardingPreview {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let delegate = PreviewDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
final class PreviewDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var tour: PreparationView!
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1120, height: 780),
                          styleMask: [.titled, .closable, .resizable, .miniaturizable],
                          backing: .buffered, defer: false)
        window.title = "Threadline · 首次使用预览"
        window.minSize = NSSize(width: 820, height: 560)
        window.isReleasedWhenClosed = false
        let menu = NSMenu(), item = NSMenuItem(), actions = NSMenu()
        for (title, selector, key) in [
            ("下载中", #selector(downloading), "1"),
            ("安装完成", #selector(ready), "2"),
            ("下载失败", #selector(failed), "3"),
            ("最小窗口", #selector(compact), "4"),
            ("退出预览", #selector(NSApplication.terminate(_:)), "q")
        ] {
            let action = actions.addItem(withTitle: title, action: selector, keyEquivalent: key)
            if key != "q" { action.target = self }
        }
        item.submenu = actions; menu.addItem(item); NSApp.mainMenu = menu
        downloading()
        if CommandLine.arguments.contains("--verify") {
            verifyLayouts()
            NSApp.terminate(nil)
            return
        }
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    private func verifyLayouts() {
        for size in [NSSize(width: 1120, height: 780), NSSize(width: 820, height: 538)] {
            window.setContentSize(size)
            for state in ["downloading", "ready", "failed"] {
                downloading()
                if state == "ready" { tour.complete {} }
                if state == "failed" { failed() }
                window.contentView!.layoutSubtreeIfNeeded()
                guard let content = tour.subviews.first else { fatalError("Missing tour") }
                precondition(tour.bounds.insetBy(dx: -1, dy: -1).contains(content.frame), "Tour clipped: \(state) \(size) \(content.frame)")
                let images = content.subviews.compactMap { $0 as? NSImageView }
                precondition(images.first?.image?.isValid == true, "Missing bundled mock image")
                let buttons = content.subviews.compactMap { $0 as? NSButton }
                if state != "downloading" {
                    precondition(buttons.contains { !$0.isHidden && $0.isEnabled }, "No recovery or completion action")
                }
            }
        }
        print("Tour layout verified at normal and minimum sizes: downloading, ready, failure")
    }
    @objc func compact() {
        window.setContentSize(NSSize(width: 820, height: 538))
    }
    @objc func downloading() {
        tour?.removeFromSuperview()
        tour = PreparationView(updating: false)
        tour.attach(to: window.contentView!)
        tour.setProgress(stage: "features", received: 18_000_000, total: 40_000_000)
    }
    @objc func ready() {
        tour.complete { NSApp.terminate(nil) }
    }
    @objc func failed() {
        tour.fail("网络暂时中断，请检查连接后重试") { self.downloading() }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
