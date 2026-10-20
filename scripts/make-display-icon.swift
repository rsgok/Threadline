import AppKit

// The application artwork is the approved sage-green transparent PNG used for
// the Dock icon. The web interface renders it on a flat cream surface, so this
// script composes that surface underneath and writes a display-sized copy.
//
// The interface never shows the icon larger than 96 CSS pixels, so a 256 pixel
// copy stays sharp on every display while replacing a 1.3 MB download with a
// 65 KB one.
let root = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
let source = root.appendingPathComponent("web/assets/threadline-app-icon.png")
let output = root.appendingPathComponent("web/assets/threadline-icon.png")
let pixels = 256

guard let artwork = NSImage(contentsOf: source) else {
  fatalError("Missing approved artwork: \(source.path)")
}

let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: pixels,
  pixelsHigh: pixels,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
)!

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
// The same cream surface the surrounding interface uses.
NSColor(srgbRed: 0.957, green: 0.941, blue: 0.902, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: pixels, height: pixels).fill()
let transform = AffineTransform(scale: CGFloat(pixels) / 1254)
(transform as NSAffineTransform).concat()
NSGraphicsContext.current?.imageInterpolation = .high
artwork.draw(
  in: NSRect(x: 0, y: 0, width: 1254, height: 1254),
  from: .zero,
  operation: .sourceOver,
  fraction: 1
)
NSGraphicsContext.restoreGraphicsState()

try rep.representation(using: .png, properties: [:])!.write(to: output)

// The message avatars are shown at 30 CSS pixels, so 64 pixels is already
// twice the resolution any display needs.
for name in ["user-avatar", "codex-avatar", "cursor-avatar"] {
  let file = root.appendingPathComponent("web/assets/\(name).png")
  guard let avatar = NSImage(contentsOf: file) else {
    fatalError("Missing avatar artwork: \(file.path)")
  }
  let size = 64
  let avatarRep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: avatarRep)
  NSGraphicsContext.current?.imageInterpolation = .high
  avatar.draw(
    in: NSRect(x: 0, y: 0, width: size, height: size),
    from: .zero,
    operation: .sourceOver,
    fraction: 1
  )
  NSGraphicsContext.restoreGraphicsState()
  try avatarRep.representation(using: .png, properties: [:])!.write(to: file)
}
