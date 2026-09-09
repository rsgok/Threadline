import AppKit
let root=URL(fileURLWithPath:CommandLine.arguments[1]);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
let source=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("web/assets/threadline-app-icon.png")
guard let artwork=NSImage(contentsOf:source) else { fatalError("Missing approved icon artwork: \(source.path)") }
func draw(_ size:Int)->Data{
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
 let transform=AffineTransform(scale:CGFloat(size)/1024);(transform as NSAffineTransform).concat()
  NSGraphicsContext.current?.imageInterpolation = .high
  NSBezierPath(roundedRect:NSRect(x:86,y:86,width:852,height:852),xRadius:190,yRadius:190).addClip()
  artwork.draw(in:NSRect(x:0,y:0,width:1024,height:1024),from:.zero,operation:.sourceOver,fraction:1)
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using:.png,properties:[:])!
}
for size in [16,32,128,256,512]{try draw(size).write(to:root.appendingPathComponent("icon_\(size)x\(size).png"));try draw(size*2).write(to:root.appendingPathComponent("icon_\(size)x\(size)@2x.png"))}
