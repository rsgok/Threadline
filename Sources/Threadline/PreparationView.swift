import AppKit

/// Shared native landing surface: it remains available while web files are replaced.
final class PreparationView: NSView {
    private let slideImage = NSImageView()
    private let slidePosition = NSTextField(labelWithString: "")
    private let previousSlide = NSButton(title: "← 上一步", target: nil, action: nil)
    private let nextSlide = NSButton(title: "下一步 →", target: nil, action: nil)
    private var slideIndex = 0
    private var slideTimer: Timer?
    private let slides = [
        ("collect", "留下值得继续的对话", "从本机对话中挑选有价值的片段，保留原文，也记下自己的判断"),
        ("organize", "让讨论围绕一个问题生长", "把相关对话放进同一条思路，沿时间线回看，发现判断之间的联系"),
        ("continue", "带着积累，开始下一次讨论", "选好材料，写下下一步的问题，把上下文一起带回 AI")
    ]
    private let heading = NSTextField(labelWithString: "")
    private let subtitle = NSTextField(wrappingLabelWithString: "")
    private let activity = NSTextField(labelWithString: "")
    private let percentage = NSTextField(labelWithString: "")
    private let metrics = NSTextField(labelWithString: "")
    private let bar = PreparationProgressBar()
    private let rows = (0..<4).map { _ in NSTextField(labelWithString: "") }
    private let back = NSButton(title: "返回应用", target: nil, action: nil)
    private var backCallback: (() -> Void)?
    private let action = NSButton(title: "重试", target: nil, action: nil)
    private var callback: (() -> Void)?
    private let updating: Bool
    private let ink = NSColor(calibratedRed: 0.22, green: 0.28, blue: 0.21, alpha: 1)
    private let muted = NSColor(calibratedRed: 0.52, green: 0.57, blue: 0.49, alpha: 1)
    private let green = NSColor(calibratedRed: 0.35, green: 0.46, blue: 0.31, alpha: 1)
    private var previousBytes: Double = 0
    private var previousTime = Date()
    private var currentStage = ""
    private var speed: Double = 0
    private var currentTotal: Double = 0
    private var timer: Timer?
    private var observedSequence: Double = -1
    init(updating: Bool) {
        self.updating = updating
        super.init(frame: .zero)
        appearance = NSAppearance(named: .aqua)
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedRed: 0.967, green: 0.976, blue: 0.95, alpha: 1).cgColor
        if !updating {
            buildTour()
            setProgress(stage: "runtime")
            return
        }
        let content = NSStackView(); content.orientation = .vertical; content.alignment = .leading; content.spacing = 0
        addSubview(content); content.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([content.centerXAnchor.constraint(equalTo: centerXAnchor), content.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -12), content.widthAnchor.constraint(equalToConstant: 520)])
        let brand = NSTextField(labelWithString: "Threadline"); brand.font = .systemFont(ofSize: 16, weight: .semibold); brand.textColor = ink
        content.addArrangedSubview(brand); content.setCustomSpacing(32, after: brand)
        heading.font = .systemFont(ofSize: 30, weight: .medium); heading.textColor = ink
        heading.stringValue = updating ? "正在更新 Threadline" : "为下一次灵感，做好准备"
        content.addArrangedSubview(heading); content.setCustomSpacing(12, after: heading)
        subtitle.font = .systemFont(ofSize: 14); subtitle.textColor = muted
        subtitle.stringValue = updating ? "只下载需要更新的内容，完成后自动回到应用" : "首次使用需要下载运行组件，准备完成后即可离线使用"
        content.addArrangedSubview(subtitle); content.setCustomSpacing(28, after: subtitle)
        let card = NSView(); card.wantsLayer = true; card.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.8).cgColor
        card.layer?.cornerRadius = 18; card.layer?.borderWidth = 1; card.layer?.borderColor = NSColor(calibratedWhite: 0.88, alpha: 1).cgColor
        content.addArrangedSubview(card); card.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
        let body = NSStackView(); body.orientation = .vertical; body.alignment = .leading; body.spacing = 18
        card.addSubview(body); body.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([body.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 26), body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -26), body.topAnchor.constraint(equalTo: card.topAnchor, constant: 24), body.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24)])
        activity.font = .systemFont(ofSize: 14, weight: .medium); activity.textColor = ink
        percentage.font = .monospacedDigitSystemFont(ofSize: 14, weight: .medium); percentage.textColor = green
        let top = NSStackView(views: [activity, NSView(), percentage]); top.orientation = .horizontal
        body.addArrangedSubview(top); top.widthAnchor.constraint(equalTo: body.widthAnchor).isActive = true
        bar.heightAnchor.constraint(equalToConstant: 6).isActive = true
        body.addArrangedSubview(bar); bar.widthAnchor.constraint(equalTo: body.widthAnchor).isActive = true
        metrics.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular); metrics.textColor = muted
        body.addArrangedSubview(metrics); body.setCustomSpacing(24, after: metrics)
        for row in rows { row.font = .systemFont(ofSize: 13); body.addArrangedSubview(row) }
        content.setCustomSpacing(22, after: card)
        let footer = NSTextField(labelWithString: updating ? "笔记与设置会保留，更新失败时恢复上一版" : "组件仅保存在本机 · 下载中断后可继续"); footer.font = .systemFont(ofSize: 12); footer.textColor = muted
        content.addArrangedSubview(footer); content.setCustomSpacing(20, after: footer)
        action.bezelStyle = .rounded; action.target = self; action.action = #selector(performAction); action.isHidden = true
        back.bezelStyle = .rounded; back.target = self; back.action = #selector(goBack); back.isHidden = true
        content.addArrangedSubview(NSStackView(views: [action, back]))
        setProgress(stage: updating ? "features" : "runtime")
    }
    private func buildTour() {
        let content = NSStackView()
        content.orientation = .vertical; content.alignment = .leading; content.spacing = 10
        addSubview(content); content.translatesAutoresizingMaskIntoConstraints = false
        let preferredWidth = content.widthAnchor.constraint(equalToConstant: 640)
        preferredWidth.priority = .defaultHigh
        NSLayoutConstraint.activate([
            content.centerXAnchor.constraint(equalTo: centerXAnchor),
            content.centerYAnchor.constraint(equalTo: centerYAnchor, constant: 6),
            content.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, constant: -64),
            preferredWidth
        ])
        let brand = NSTextField(labelWithString: "Threadline  /  从对话到思路")
        brand.font = .systemFont(ofSize: 12, weight: .medium); brand.textColor = muted
        content.addArrangedSubview(brand)
        heading.font = .systemFont(ofSize: 27, weight: .medium); heading.textColor = ink
        content.addArrangedSubview(heading)
        subtitle.font = .systemFont(ofSize: 13); subtitle.textColor = muted
        content.addArrangedSubview(subtitle)
        subtitle.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
        slideImage.setContentCompressionResistancePriority(.init(1), for: .horizontal)
        slideImage.setContentCompressionResistancePriority(.init(1), for: .vertical)
        slideImage.setContentHuggingPriority(.init(1), for: .horizontal)
        slideImage.setContentHuggingPriority(.init(1), for: .vertical)
        slideImage.imageScaling = .scaleProportionallyUpOrDown
        slideImage.wantsLayer = true; slideImage.layer?.cornerRadius = 10
        slideImage.layer?.masksToBounds = true
        content.addArrangedSubview(slideImage)
        NSLayoutConstraint.activate([
            slideImage.widthAnchor.constraint(equalTo: content.widthAnchor),
            slideImage.heightAnchor.constraint(equalTo: heightAnchor, multiplier: 0.46)
        ])
        previousSlide.target = self; previousSlide.action = #selector(previous)
        nextSlide.target = self; nextSlide.action = #selector(next)
        for button in [previousSlide, nextSlide] {
            button.bezelStyle = .rounded
            button.font = .systemFont(ofSize: 12, weight: .medium)
        }
        slidePosition.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        slidePosition.textColor = muted
        let leftSpace = NSView(), rightSpace = NSView()
        let navigation = NSStackView(views: [previousSlide, leftSpace, slidePosition, rightSpace, nextSlide])
        navigation.orientation = .horizontal
        leftSpace.widthAnchor.constraint(equalTo: rightSpace.widthAnchor).isActive = true
        content.addArrangedSubview(navigation)
        navigation.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
        content.setCustomSpacing(18, after: navigation)
        activity.font = .systemFont(ofSize: 12, weight: .medium); activity.textColor = ink
        percentage.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium); percentage.textColor = green
        let status = NSStackView(views: [activity, NSView(), percentage])
        status.orientation = .horizontal
        content.addArrangedSubview(status)
        status.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
        content.addArrangedSubview(bar)
        bar.heightAnchor.constraint(equalToConstant: 4).isActive = true
        bar.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
        metrics.font = .systemFont(ofSize: 11); metrics.textColor = muted
        content.addArrangedSubview(metrics)
        action.bezelStyle = .rounded; action.target = self; action.action = #selector(performAction)
        action.isHidden = true
        content.addArrangedSubview(action)
        renderSlide()
    }
    private func renderSlide() {
        let slide = slides[slideIndex]
        heading.stringValue = slide.1; subtitle.stringValue = slide.2
        if let url = Bundle.main.url(forResource: slide.0, withExtension: "png", subdirectory: "onboarding") {
            slideImage.image = NSImage(contentsOf: url)
        }
        slideImage.setAccessibilityLabel("示例界面：" + slide.1)
        slidePosition.stringValue = "\(slideIndex + 1) / \(slides.count) · 示例数据"
        previousSlide.isEnabled = slideIndex > 0
        nextSlide.isEnabled = slideIndex < slides.count - 1
    }
    @objc private func previous() {
        slideTimer?.invalidate(); slideTimer = nil
        slideIndex = max(0, slideIndex - 1); renderSlide()
    }
    @objc private func next() {
        slideTimer?.invalidate(); slideTimer = nil
        slideIndex = min(slides.count - 1, slideIndex + 1); renderSlide()
    }
    func complete(_ completion: @escaping () -> Void) {
        stopObserving(); slideTimer?.invalidate(); slideTimer = nil
        setProgress(stage: "done")
        metrics.stringValue = "已准备好，随时开始"
        action.title = "开始使用"; action.isHidden = false
        callback = completion
    }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        slideTimer?.invalidate(); slideTimer = nil
        guard window != nil, !updating, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        slideTimer = Timer.scheduledTimer(withTimeInterval: 8, repeats: true) { [weak self] timer in
            guard let self, self.slideIndex < self.slides.count - 1 else { timer.invalidate(); return }
            // Do not move the slide while the user is navigating its controls.
            guard self.window?.firstResponder !== self.previousSlide,
                  self.window?.firstResponder !== self.nextSlide else { return }
            self.slideIndex += 1; self.renderSlide()
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    func attach(to parent: NSView) {
        parent.addSubview(self); translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([leadingAnchor.constraint(equalTo: parent.leadingAnchor), trailingAnchor.constraint(equalTo: parent.trailingAnchor), topAnchor.constraint(equalTo: parent.topAnchor), bottomAnchor.constraint(equalTo: parent.bottomAnchor)])
    }
    var onProgress: ((String) -> Void)?
    func setProgress(stage: String, received: Double = 0, total: Double = 0) {
        onProgress?(stage)
        let names = ["运行环境", "界面与功能", "安全校验与安装", "启动应用"]
        let index = ["runtime": 0, "features": 1, "verify": 2, "start": 3, "done": 4][stage] ?? 1
        if currentStage != stage || (currentTotal == 0 && total > 0) { previousBytes = received; previousTime = Date(); speed = 0; currentStage = stage }
        currentTotal = total
        let elapsed = Date().timeIntervalSince(previousTime)
        if elapsed >= 0.5 {
            speed = max(0, (received - previousBytes) / elapsed)
            previousBytes = received; previousTime = Date()
        }
        for (i, row) in rows.enumerated() {
            row.stringValue = i < index ? "✓   \(names[i])\(i == 0 && updating ? " · 复用现有组件" : " · 已就绪")" : i == index ? "●   \(names[i])" : "○   \(names[i])"
            row.textColor = i == index ? ink : i < index ? green : muted
        }
        activity.stringValue = ["runtime": "正在准备运行环境", "features": "正在下载界面与功能", "verify": "正在校验并安装", "start": "正在启动应用", "done": "准备完成"][stage] ?? "正在准备"
        bar.setAccessibilityRole(.progressIndicator)
        let determinate = total > 0 || stage == "done"
        bar.isIndeterminate = !determinate
        if determinate { bar.stopAnimation(nil); bar.doubleValue = stage == "done" ? 100 : min(100, received / total * 100) }
        else { bar.startAnimation(nil) }
        bar.setAccessibilityValue(determinate ? "\(Int(bar.doubleValue))%" : "进行中")
        percentage.stringValue = determinate ? "\(Int(bar.doubleValue))%" : ""
        if total > 0 {
            let amount = String(format: "%.1f / %.1f MB", received / 1_000_000, total / 1_000_000)
            let rate = speed > 0 ? String(format: "  ·  %.1f MB/s", speed / 1_000_000) : ""
            let remaining = speed > 0 && received < total ? "  ·  约 \(Int(ceil((total - received) / speed))) 秒" : ""
            metrics.stringValue = amount + rate + remaining
        } else { metrics.stringValue = stage == "done" ? "即将回到 Threadline" : stage == "verify" ? "检查签名与文件完整性，完成后安全切换" : stage == "start" ? "确认服务与界面版本一致" : "正在连接，已有组件将直接复用" }
        setAccessibilityLabel(activity.stringValue + " " + percentage.stringValue + " " + metrics.stringValue)
    }
    func fail(_ message: String, back: (() -> Void)? = nil, retry: @escaping () -> Void) {
        stopObserving(); slideTimer?.invalidate(); slideTimer = nil; bar.stopAnimation(nil); bar.isIndeterminate = false
        previousSlide.isEnabled = false; nextSlide.isEnabled = false
        heading.stringValue = "准备暂时停在这里"; activity.stringValue = "未能完成准备"; percentage.stringValue = ""
        subtitle.stringValue = message; metrics.stringValue = "已下载的内容会保留，重试时继续"; callback = retry
        action.isHidden = false
        backCallback = back; self.back.isHidden = back == nil
    }
    func observe(_ file: URL) {
        stopObserving(); observedSequence = -1
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self, let data = try? Data(contentsOf: file), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let sequence = value["sequence"] as? Double, sequence > self.observedSequence, let stage = value["stage"] as? String else { return }
            self.observedSequence = sequence
            self.setProgress(stage: stage, received: value["received"] as? Double ?? 0, total: value["total"] as? Double ?? 0)
        }
    }
    func stopObserving() { timer?.invalidate(); timer = nil }
    override func removeFromSuperview() { slideTimer?.invalidate(); slideTimer = nil; stopObserving(); bar.stopAnimation(nil); super.removeFromSuperview() }
    @objc private func goBack() { backCallback?() }
    @objc private func performAction() { callback?() }
}

private final class PreparationProgressBar: NSView {
    var isIndeterminate = true { didSet { needsDisplay = true } }
    var doubleValue: Double = 0 { didSet { needsDisplay = true } }
    private var timer: Timer?
    private var phase: CGFloat = 0
    func startAnimation(_ sender: Any?) {
        guard timer == nil, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 0.04, repeats: true) { [weak self] _ in
            guard let self else { return }; self.phase = (self.phase + 0.025).truncatingRemainder(dividingBy: 1); self.needsDisplay = true
        }
    }
    func stopAnimation(_ sender: Any?) { timer?.invalidate(); timer = nil }
    override func viewDidMoveToWindow() { if window == nil { stopAnimation(nil) } }
    override func draw(_ dirtyRect: NSRect) {
        NSColor(calibratedRed: 0.91, green: 0.93, blue: 0.89, alpha: 1).setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 3, yRadius: 3).fill()
        let width = isIndeterminate ? bounds.width * 0.2 : bounds.width * CGFloat(max(0, min(100, doubleValue))) / 100
        let rect = NSRect(x: isIndeterminate ? (bounds.width - width) * phase : 0, y: 0, width: width, height: bounds.height)
        NSColor(calibratedRed: 0.43, green: 0.55, blue: 0.36, alpha: 1).setFill()
        NSBezierPath(roundedRect: rect, xRadius: 3, yRadius: 3).fill()
    }
}
