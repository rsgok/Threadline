import AppKit
import WebKit
import Carbon

final class ThreadlineWindow: NSWindow {
    var canStartDrag: ((NSPoint) -> Bool)?
    private var dragStart: (mouse: NSPoint, origin: NSPoint)?

    override func sendEvent(_ event: NSEvent) {
        if event.type == .leftMouseDown, canStartDrag?(event.locationInWindow) == true {
            makeKeyAndOrderFront(nil)
            dragStart = (convertPoint(toScreen: event.locationInWindow), frame.origin)
            return
        }
        if let start = dragStart {
            if event.type == .leftMouseDragged {
                let mouse = convertPoint(toScreen: event.locationInWindow)
                setFrameOrigin(NSPoint(x: start.origin.x + mouse.x - start.mouse.x,
                                       y: start.origin.y + mouse.y - start.mouse.y))
                return
            }
            if event.type == .leftMouseUp { dragStart = nil; return }
        }
        super.sendEvent(event)
    }
    override func resignKey() { dragStart = nil; super.resignKey() }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler, NSToolbarDelegate {
    var statusItem: NSStatusItem?
    var window: NSWindow!
    var web: WKWebView!
    var hotKeys: [EventHotKeyRef] = []
    var handler: EventHandlerRef?
    var dragRegions: [NSRect] = []
    var dragExclusions: [NSRect] = []
    let base = URL(string: "http://127.0.0.1:43127")!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let main = NSMenu(), appMenu = NSMenu(), item = NSMenuItem()
        appMenu.addItem(withTitle: "关于 Threadline", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(withTitle: "退出 Threadline", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = appMenu; main.addItem(item)
        let edit = NSMenu(title: "编辑")
        for (title, selector, key) in [("撤销", "undo:", "z"),("剪切","cut:","x"),("复制","copy:","c"),("粘贴","paste:","v"),("全选","selectAll:","a")] { edit.addItem(withTitle:title, action:Selector(selector), keyEquivalent:key) }
        let editItem = NSMenuItem(title:"编辑",action:nil,keyEquivalent:""); editItem.submenu=edit;main.addItem(editItem);NSApp.mainMenu=main
        let menu=NSMenu()
        menu.addItem(withTitle:"打开 Threadline",action:#selector(show),keyEquivalent:"")
        menu.addItem(withTitle:"在 Codex 侧栏打开",action:#selector(openInCodex),keyEquivalent:"")
        menu.addItem(withTitle:"复制链接到 Cursor Agents",action:#selector(openInCursor),keyEquivalent:"")
        menu.addItem(withTitle:"搜索笔记  ⌃⌥R",action:#selector(search),keyEquivalent:"")
        menu.addItem(withTitle:"添加剪贴板文字  ⌃⌥S",action:#selector(capture),keyEquivalent:"")
        menu.addItem(withTitle:"打开数据文件夹",action:#selector(openData),keyEquivalent:"")
        for item in menu.items {item.target=self}
        let windowMenuItem=NSMenuItem(title:"窗口",action:nil,keyEquivalent:"");menu.title="窗口";windowMenuItem.submenu=menu;main.addItem(windowMenuItem)
        window=ThreadlineWindow(contentRect:NSRect(x:0,y:0,width:1120,height:780),styleMask:[.titled,.closable,.miniaturizable,.resizable,.fullSizeContentView],backing:.buffered,defer:false)
        window.title="Threadline · 思续";window.minSize=NSSize(width:820,height:560);window.center();window.setFrameAutosaveName("ThreadlineWindow");window.isReleasedWhenClosed=false;window.delegate=self
        window.appearance=NSAppearance(named:.aqua)
        window.backgroundColor=NSColor(calibratedRed:1,green:0.996,blue:0.984,alpha:1)
        window.titlebarAppearsTransparent=true;window.titleVisibility = .hidden;window.isMovableByWindowBackground=true
        window.titlebarSeparatorStyle = .none
        window.toolbar=nil
        let config=WKWebViewConfiguration();config.userContentController.add(self,name:"openInCodex");config.userContentController.add(self,name:"windowChrome")
        web=WKWebView(frame:.zero,configuration:config);web.navigationDelegate=self;web.uiDelegate=self;let content=NSView(frame:NSRect(x:0,y:0,width:1120,height:780))
        web.frame=content.bounds;web.autoresizingMask=[.width,.height];content.addSubview(web)
        window.contentView=content
        (window as? ThreadlineWindow)?.canStartDrag = { [weak self] point in
            guard let self else { return false }
            let local=self.web.convert(point,from:nil)
            let cssPoint=NSPoint(x:local.x,y:self.web.isFlipped ? local.y : self.web.bounds.height-local.y)
            // macOS owns the traffic-light buttons even when the web header sits underneath.
            if cssPoint.x < 80 && cssPoint.y < 32 { return false }
            return self.dragRegions.contains { $0.contains(cssPoint) }
                && !self.dragExclusions.contains { $0.contains(cssPoint) }
        }
        // Use the same full-color artwork as the app, including its original background.
        let status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let artwork = Bundle.main.url(forResource: "TrayIcon", withExtension: "png").flatMap { NSImage(contentsOf: $0) } ?? NSApp.applicationIconImage
        artwork?.size = NSSize(width: 20, height: 20)
        artwork?.isTemplate = false
        status.button?.image = artwork
        status.button?.toolTip = "Threadline · 思续"
        status.button?.setAccessibilityLabel("Threadline")
        let statusMenu = menu.copy() as! NSMenu
        statusMenu.addItem(.separator())
        statusMenu.addItem(withTitle: "退出 Threadline", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        status.menu = statusMenu
        statusItem = status
        registerKeys();show();connect(attempt:0)
    }
    func toolbarAllowedItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier]{toolbarDefaultItemIdentifiers(toolbar)}
    func toolbarDefaultItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier]{[.init("captureProgress"),.init("library"),.init("search"),.flexibleSpace,.init("codex"),.init("cursor")]}
    func toolbar(_ toolbar:NSToolbar,itemForItemIdentifier id:NSToolbarItem.Identifier,willBeInsertedIntoToolbar flag:Bool)->NSToolbarItem?{
        let item=NSToolbarItem(itemIdentifier:id)
        let options:[String:(String,String,Selector)]=["captureProgress":("收录对话","plus.bubble",#selector(progress)),"library":("资料库","books.vertical",#selector(library)),"search":("搜索","magnifyingglass",#selector(search)),"cursor":("Cursor Agents","link",#selector(openInCursor)),"codex":("在 Codex 打开","sidebar.right",#selector(openInCodex))]
        guard let option=options[id.rawValue] else{return nil};item.label=option.0;item.toolTip=option.0;item.image=NSImage(systemSymbolName:option.1,accessibilityDescription:option.0);item.target=self;item.action=option.2;return item
    }
    @objc func progress(){show();web.evaluateJavaScript("openSessionPicker()")}
    @objc func library(){show();web.evaluateJavaScript("if(!sessionSaving){document.getElementById('save-session-dialog').close();hideSessionView();goWorkspace('all')}")}
    func connect(attempt:Int){
        var request=URLRequest(url:base.appendingPathComponent("health"));request.timeoutInterval=1
        URLSession.shared.dataTask(with:request){data,response,_ in
            let valid = (try? JSONSerialization.jsonObject(with:data ?? Data())) as? [String:Any]
            DispatchQueue.main.async {
                if valid?["app"] as? String == "rewind-web" {self.web.load(URLRequest(url:URL(string:"http://127.0.0.1:43127/?native=1")!));return}
                if attempt==0 {let p=Process();p.executableURL=URL(fileURLWithPath:"/bin/launchctl");p.arguments=["kickstart","gui/\(getuid())/local.rewind.web"];try? p.run()}
                if attempt<20 {DispatchQueue.main.asyncAfter(deadline:.now()+0.3){self.connect(attempt:attempt+1)}}
                else {let alert=NSAlert();alert.messageText="Threadline 本机服务未能启动";alert.informativeText="笔记仍保存在本机。请重新运行安装脚本，或重试。";alert.addButton(withTitle:"重试");alert.addButton(withTitle:"关闭");if alert.runModal() == .alertFirstButtonReturn{self.connect(attempt:0)}}
            }
        }.resume()
    }
    @objc func show(){window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)}
    @objc func search(){show();web.evaluateJavaScript("focusSessionSearch()")}
    @objc func capture(){show();let text=NSPasteboard.general.string(forType:.string) ?? "";let data=try! JSONSerialization.data(withJSONObject:[text]);let argument=String(data:data,encoding:.utf8)!;web.evaluateJavaScript("openCapture();document.getElementById('capture-body').value=\(argument)[0]")}
    @objc func openInCodex(){web.evaluateJavaScript("openInCodexSidebar()")}
    @objc func openInCursor(){web.evaluateJavaScript("openInCodexSidebar(\"cursor\")")}
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
        if message.name == "windowChrome" {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.host == "127.0.0.1",
                  message.frameInfo.securityOrigin.port == 43127,
                  let body=message.body as? [String:Any] else { return }
            func rectangles(_ value: Any?) -> [NSRect] {
                guard let rows=value as? [[Double]], rows.count <= 100 else { return [] }
                return rows.compactMap { row in
                    guard row.count == 4, row.allSatisfy({ $0.isFinite }), row[2] > 0, row[3] > 0 else { return nil }
                    return NSRect(x:row[0],y:row[1],width:row[2],height:row[3])
                }
            }
            dragRegions=rectangles(body["regions"])
            dragExclusions=rectangles(body["exclusions"])
            return
        }

        guard message.name=="openInCodex",message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host=="127.0.0.1",message.frameInfo.securityOrigin.port==43127,
              let body=message.body as? [String:String],let value=body["url"],let runtime=body["runtime"],["codex","cursor"].contains(runtime),let url=URL(string:value),url.scheme=="http",url.host=="127.0.0.1",url.port==43127 else{return}
        if runtime=="cursor" {
            NSPasteboard.general.clearContents();NSPasteboard.general.setString(url.absoluteString,forType:.string)
            // Cursor Agents has no browser-URL deep link in the installed version.
            // Focus Agents only; never route the user into an unrelated IDE window.
            NSWorkspace.shared.open(URL(string:"cursor://anysphere.cursor-deeplink/glass")!)
            return
        }
        var link=URLComponents();link.scheme=runtime;link.host="browser";link.queryItems=[URLQueryItem(name:"url",value:url.absoluteString)]
        guard let target=link.url else{return}
        if !NSWorkspace.shared.open(target){let alert=NSAlert();alert.messageText="未能打开 \(runtime)";alert.informativeText="请确认已安装对应应用；Cursor 请使用 Agents 的 Browser 入口。";alert.runModal()}
    }
    @objc func openData(){NSWorkspace.shared.open(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/RewindWeb"))}
    @objc func about(){NSApp.orderFrontStandardAboutPanel(options:[.applicationName:"Threadline · 思续",.applicationVersion:"0.3.0",.credits:NSAttributedString(string:"思续，让思考继续\nCarry your thinking forward.")])}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool{show();return true}
    func windowShouldClose(_ sender:NSWindow)->Bool{sender.orderOut(nil);return false}
    func registerKeys(){
        var event=EventTypeSpec(eventClass:OSType(kEventClassKeyboard),eventKind:UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(),{_,event,context in
            guard let event=event,let context=context else{return OSStatus(eventNotHandledErr)}
            var key=EventHotKeyID();GetEventParameter(event,EventParamName(kEventParamDirectObject),EventParamType(typeEventHotKeyID),nil,MemoryLayout<EventHotKeyID>.size,nil,&key)
            let app=Unmanaged<AppDelegate>.fromOpaque(context).takeUnretainedValue();if key.id==1{app.search()}else{app.capture()};return noErr
        },1,&event,Unmanaged.passUnretained(self).toOpaque(),&handler)
        for (id,code) in [(UInt32(1),UInt32(kVK_ANSI_R)),(UInt32(2),UInt32(kVK_ANSI_S))]{var ref:EventHotKeyRef?;RegisterEventHotKey(code,UInt32(controlKey|optionKey),EventHotKeyID(signature:0x54485244,id:id),GetApplicationEventTarget(),0,&ref);if let ref=ref{hotKeys.append(ref)}}
    }
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        guard let url=action.request.url else{decisionHandler(.cancel);return}
        if url.scheme=="http" && url.host=="127.0.0.1" && url.port==43127 {decisionHandler(action.shouldPerformDownload ? .download : .allow)}
        else {if action.navigationType == .linkActivated && ["https","http"].contains(url.scheme ?? ""){NSWorkspace.shared.open(url)};decisionHandler(.cancel)}
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
    func webView(_ webView:WKWebView,decidePolicyFor response:WKNavigationResponse,decisionHandler:@escaping(WKNavigationResponsePolicy)->Void){decisionHandler(response.canShowMIMEType ? .allow : .download)}
    func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void){let panel=NSSavePanel();panel.nameFieldStringValue=suggestedFilename;panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.url:nil)}}
    func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void){let panel=NSOpenPanel();panel.allowsMultipleSelection=parameters.allowsMultipleSelection;panel.canChooseDirectories=false;panel.beginSheetModal(for:window){result in completionHandler(result == .OK ? panel.urls:nil)}}
}
let app=NSApplication.shared
let delegate=AppDelegate()
app.delegate=delegate;app.setActivationPolicy(.regular);app.run()
