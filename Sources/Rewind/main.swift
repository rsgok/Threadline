import AppKit
import Carbon
import Vision
import WebKit
import RewindCore

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var library: Library!
    var window: NSWindow!
    var webView: WKWebView!
    var statusItem: NSStatusItem!
    var hotKeys: [EventHotKeyRef] = []
    var handler: EventHandlerRef?
    var localKeyMonitor: Any?
    var externalApp = "未知应用"
    var activationObserver: NSObjectProtocol?
    var query = ""
    var feedback = "已保存到本机"
    var visible: [Clip] = []
    var selectedID: UUID?
    var draft: Clip?
    var saveTimer: Timer?
    var pageReady = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let override = ProcessInfo.processInfo.environment["REWIND_DATA_DIR"]
            let folder = override.map { URL(fileURLWithPath: $0) } ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Rewind")
            library = try Library(directory: folder)
        } catch {
            let alert = NSAlert()
            alert.messageText = "无法打开收藏库"
            alert.informativeText = "已有文件不会被覆盖。\n\(error.localizedDescription)"
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        if let app = NSWorkspace.shared.frontmostApplication, app.bundleIdentifier != Bundle.main.bundleIdentifier { externalApp = app.localizedName ?? "未知应用" }
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.processIdentifier != ProcessInfo.processInfo.processIdentifier,
                  app.activationPolicy == .regular else { return }
            self?.externalApp = app.localizedName ?? "未知应用"
        }
        makeMenu()
        makeWindow()
        registerShortcuts()
        refresh()
        if let first = visible.first { select(first.id) }
        showWindow()
    }

    func makeMenu() {
        let menu = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 Rewind", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 Rewind", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let item = NSMenuItem(); item.submenu = appMenu; menu.addItem(item)
        let edit = NSMenu(title: "编辑")
        edit.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: ""); editItem.submenu = edit; menu.addItem(editItem)
        NSApp.mainMenu = menu
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "bookmark.circle.fill", accessibilityDescription: "Rewind")
        let tray = NSMenu()
        tray.addItem(withTitle: "搜索收藏  ⌃⌥R", action: #selector(openSearch), keyEquivalent: "")
        tray.addItem(withTitle: "收藏剪贴板  ⌃⌥S", action: #selector(capture), keyEquivalent: "")
        tray.addItem(.separator())
        tray.addItem(withTitle: "导出全部收藏…", action: #selector(exportAll), keyEquivalent: "")
        tray.addItem(withTitle: "打开数据文件夹", action: #selector(openData), keyEquivalent: "")
        tray.addItem(.separator())
        tray.addItem(withTitle: "退出 Rewind", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        for item in tray.items where item.action != #selector(NSApplication.terminate(_:)) { item.target = self }
        statusItem.menu = tray
    }

    func makeWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Rewind"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(calibratedRed: 0.97, green: 0.96, blue: 0.94, alpha: 1)
        window.minSize = NSSize(width: 920, height: 650)
        window.center()
        window.setFrameAutosaveName("RewindReadingWindow")
        window.isReleasedWhenClosed = false
        window.delegate = self
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "rewind")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        window.contentView = webView
        webView.loadHTMLString(Interface.html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        sendState()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let payload = message.body as? [String: Any], let action = payload["action"] as? String else { return }
        switch action {
        case "capture": capture()
        case "search":
            guard flush() else { return }
            query = payload["query"] as? String ?? ""
            refresh()
            if !visible.contains(where: { $0.id == selectedID }) {
                selectedID = visible.first?.id
                render(visible.first)
            }
        case "select":
            if let raw = payload["id"] as? String, let id = UUID(uuidString: raw) { select(id) }
        case "edit":
            guard let raw = payload["id"] as? String, let id = UUID(uuidString: raw), id == selectedID,
                  var clip = library.clips.first(where: { $0.id == id }) else { return }
            clip.title = payload["title"] as? String ?? clip.title
            clip.body = payload["body"] as? String ?? clip.body
            clip.note = payload["note"] as? String ?? clip.note
            clip.question = payload["question"] as? String ?? clip.question
            clip.sourceURL = payload["sourceURL"] as? String ?? clip.sourceURL
            clip.updatedAt = Date()
            draft = clip
            feedback = "正在保存…"
            saveTimer?.invalidate()
            saveTimer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: false) { [weak self] _ in _ = self?.flush() }
        case "done":
            if flush() { webView.evaluateJavaScript("window.finishEditing()", completionHandler: nil) }
        case "copyContext": copyContext()
        case "copyBody": copyBody()
        case "attachment": openAttachment()
        case "export": exportSelected()
        case "exportAll": exportAll()
        case "delete": deleteSelected()
        case "openData": openData()
        default: break
        }
        sendState()
    }

    func sendState() {
        guard pageReady else { return }
        let items: [[String: Any]] = visible.map { clip in
            ["id": clip.id.uuidString, "title": clip.title, "body": clip.body, "note": clip.note,
             "question": clip.question, "source": clip.source, "sourceURL": clip.sourceURL,
             "date": clip.createdAt.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits)),
             "hasImage": clip.attachment != nil]
        }
        let payload: [String: Any] = ["clips": items, "total": library.clips.count, "selectedID": selectedID?.uuidString ?? "", "query": query, "feedback": feedback]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.updateState(\(json))", completionHandler: nil)
    }

    func registerShortcuts() {
        // App-targeted synthetic events do not travel through the system hotkey
        // dispatcher. Handle the same combination when our own window is focused.
        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            let modifiers = event.modifierFlags.intersection([.control, .option, .command, .shift])
            guard let self, modifiers == [.control, .option] else { return event }
            if event.keyCode == UInt16(kVK_ANSI_S) { self.capture(); return nil }
            if event.keyCode == UInt16(kVK_ANSI_R) { self.openSearch(); return nil }
            return event
        }
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let callback: EventHandlerUPP = { _, event, context in
            guard let context, let event else { return OSStatus(eventNotHandledErr) }
            var key = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &key)
            let app = Unmanaged<AppDelegate>.fromOpaque(context).takeUnretainedValue()
            if key.id == 1 { app.capture() } else { app.openSearch() }
            return noErr
        }
        InstallEventHandler(GetApplicationEventTarget(), callback, 1, &event, Unmanaged.passUnretained(self).toOpaque(), &handler)
        for (id, code) in [(UInt32(1), UInt32(kVK_ANSI_S)), (UInt32(2), UInt32(kVK_ANSI_R))] {
            var ref: EventHotKeyRef?
            let result = RegisterEventHotKey(code, UInt32(controlKey | optionKey), EventHotKeyID(signature: 0x52574E44, id: id), GetApplicationEventTarget(), 0, &ref)
            if result == noErr, let ref { hotKeys.append(ref) }
            else { report("快捷键注册失败（\(result)）。请使用菜单栏入口。") }
        }
    }

    @objc func showWindow() { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil) }
    @objc func openSearch() { showWindow(); webView.evaluateJavaScript("document.getElementById('search').focus()", completionHandler: nil) }
    @objc func openData() { NSWorkspace.shared.open(library.directory) }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "Rewind", .applicationVersion: "0.1.0", .credits: NSAttributedString(string: "留住值得回看的回答。\n本地收藏 · 搜索 · 跨 runtime 复用")]) }

    func refresh() {
        visible = library.clips.filter { $0.matches(query) }
        sendState()
    }

    func select(_ id: UUID) {
        guard flush(), library.clips.contains(where: { $0.id == id }) else { return }
        selectedID = id
        refresh()
        render(library.clips.first { $0.id == id })
    }

    func render(_ clip: Clip?) {
        draft = nil
        feedback = clip == nil ? "" : "已保存到本机"
        sendState()
    }

    @discardableResult func flush() -> Bool {
        saveTimer?.invalidate()
        guard let clip = draft else { return true }
        do {
            try library.put(clip)
            draft = nil
            feedback = "已保存到本机"
            refresh()
            return true
        } catch { report("保存失败：\(error.localizedDescription)"); return false }
    }

    @objc func capture() {
        guard flush() else { return }
        let pasteboard = NSPasteboard.general
        var text = pasteboard.string(forType: .string) ?? ""
        if text.isEmpty, let data = pasteboard.data(forType: .rtf), let rich = NSAttributedString(rtf: data, documentAttributes: nil) { text = rich.string }
        if text.isEmpty, let data = pasteboard.data(forType: .html), let rich = NSAttributedString(html: data, documentAttributes: nil) { text = rich.string }
        // Only decode explicit image clipboard formats; do not fetch URLs or read arbitrary file paths.
        let imageData = pasteboard.data(forType: .png) ?? pasteboard.data(forType: .tiff)
        let image = imageData.flatMap { NSImage(data: $0) }
        let png = image?.tiffRepresentation.flatMap { NSBitmapImageRep(data: $0)?.representation(using: .png, properties: [:]) }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || png != nil else {
            showWindow(); report("剪贴板里没有文字或图片。先复制一段回答，或用 ⌃⇧⌘4 截图到剪贴板。")
            return
        }
        do {
            let attachment = try png.map { try library.saveImage($0) }
            let clip = Clip(body: text, source: externalApp, attachment: attachment)
            do { try library.put(clip) }
            catch { if let attachment { try? FileManager.default.removeItem(at: library.attachmentURL(attachment)) }; throw error }
            query = ""
            select(clip.id)
            showWindow()
            sendState()
            if text.isEmpty, let png { recognize(png, id: clip.id) }
        } catch { report("收藏失败：\(error.localizedDescription)") }
    }

    func recognize(_ png: Data, id: UUID) {
        feedback = "原图已保存，正在本机识别文字…"
        sendState()
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["zh-Hans", "en-US"]
            request.usesLanguageCorrection = true
            do {
                try VNImageRequestHandler(data: png).perform([request])
                let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
                DispatchQueue.main.async {
                    guard self.flush(), var clip = self.library.clips.first(where: { $0.id == id }), clip.body.isEmpty else { return }
                    clip.body = text
                    if clip.title == "截图收藏", !text.isEmpty { clip.title = Clip.suggestTitle(text) }
                    do {
                        try self.library.put(clip)
                        self.refresh()
                        if self.selectedID == id { self.render(clip); self.feedback = text.isEmpty ? "原图已保存，未识别到文字" : "已识别文字并保存 · 请对照原图核对"; self.sendState() }
                    } catch { self.report("原图已保存，识别文字保存失败：\(error.localizedDescription)") }
                }
            } catch {
                DispatchQueue.main.async { if self.selectedID == id { self.report("原图已保存，文字识别失败：\(error.localizedDescription)") } }
            }
        }
    }

    func current() -> Clip? { guard flush() else { return nil }; return library.clips.first { $0.id == selectedID } }
    func copy(_ text: String, message: String) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string); feedback = message; sendState() }
    @objc func copyBody() { if let clip = current() { copy(clip.body, message: "已复制原文，粘贴到任意应用即可") } }
    @objc func copyContext() { if let clip = current() { copy(clip.context, message: "已复制原文、备注和来源，粘贴给 AI 即可") } }
    @objc func openAttachment() { if let name = current()?.attachment { NSWorkspace.shared.open(library.attachmentURL(name)) } }
    @objc func exportSelected() { if let clip = current() { export([clip]) } }
    @objc func exportAll() { guard flush() else { return }; export(library.clips) }
    func export(_ clips: [Clip]) {
        guard !clips.isEmpty else { report("还没有可导出的收藏。"); return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.canCreateDirectories = true
        panel.prompt = "导出到这里"
        panel.message = "导出 \(clips.count) 条收藏为 Markdown，包含原图附件。"
        showWindow()
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let url = panel.url else { return }
            do {
                let folder = url.appendingPathComponent("Rewind-" + UUID().uuidString.prefix(8))
                try self.library.export(clips, to: folder)
                self.feedback = "已导出 \(clips.count) 条收藏"
                self.sendState()
                NSWorkspace.shared.open(folder)
            } catch { self.report("导出失败：\(error.localizedDescription)") }
        }
    }
    @objc func deleteSelected() {
        guard let clip = current() else { return }
        let alert = NSAlert()
        alert.messageText = "删除“\(clip.title)”？"
        alert.informativeText = "这条收藏及其原图将从本机收藏库删除。"
        alert.addButton(withTitle: "取消"); alert.addButton(withTitle: "删除")
        alert.beginSheetModal(for: window) { response in
            guard response == .alertSecondButtonReturn else { return }
            do {
                try self.library.remove(clip.id)
                self.selectedID = nil
                self.refresh()
                if let next = self.visible.first { self.select(next.id) } else { self.render(nil) }
            } catch { self.report("删除失败：\(error.localizedDescription)") }
        }
    }
    func report(_ message: String) {
        feedback = message
        let alert = NSAlert(); alert.messageText = "Rewind"; alert.informativeText = message
        if let window, window.isVisible { alert.beginSheetModal(for: window) } else { alert.runModal() }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { flush() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { flush() ? .terminateNow : .terminateCancel }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
