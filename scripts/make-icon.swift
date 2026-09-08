import AppKit
let root=URL(fileURLWithPath:CommandLine.arguments[1]);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
func draw(_ size:Int,_ tray:Bool=false)->Data{
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
 let transform=AffineTransform(scale:CGFloat(size)/1024);(transform as NSAffineTransform).concat()
 if !tray{NSColor(calibratedWhite:0.98,alpha:1).setFill();NSBezierPath(roundedRect:NSRect(x:60,y:60,width:904,height:904),xRadius:205,yRadius:205).fill()}
 let t=NSAffineTransform();t.translateX(by:tray ? 0:150,yBy:tray ? 1024:874);t.scaleX(by:tray ? 1024/24:724/24,yBy:tray ? -1024/24:-724/24);t.concat()
 NSColor(calibratedRed:0.09,green:0.125,blue:0.18,alpha:1).setStroke()
 let p=NSBezierPath();p.lineWidth=1.65;p.lineCapStyle = .round;p.lineJoinStyle = .round
 p.move(to:NSPoint(x:5,y:5));p.line(to:NSPoint(x:14,y:5));p.curve(to:NSPoint(x:18,y:9),controlPoint1:NSPoint(x:16.209,y:5),controlPoint2:NSPoint(x:18,y:6.791));p.curve(to:NSPoint(x:14,y:13),controlPoint1:NSPoint(x:18,y:11.209),controlPoint2:NSPoint(x:16.209,y:13));p.line(to:NSPoint(x:9,y:13));p.curve(to:NSPoint(x:6,y:16),controlPoint1:NSPoint(x:7.343,y:13),controlPoint2:NSPoint(x:6,y:14.343));p.curve(to:NSPoint(x:9,y:19),controlPoint1:NSPoint(x:6,y:17.657),controlPoint2:NSPoint(x:7.343,y:19));p.line(to:NSPoint(x:19,y:19));p.stroke()
 for (x,y) in [(5.0,5.0),(19.0,19.0)]{let circle=NSBezierPath(ovalIn:NSRect(x:x-1.5,y:y-1.5,width:3,height:3));circle.lineWidth=1.3;circle.stroke()}
 NSGraphicsContext.restoreGraphicsState();return rep.representation(using:.png,properties:[:])!
}
for size in [16,32,128,256,512]{try draw(size).write(to:root.appendingPathComponent("icon_\(size)x\(size).png"));try draw(size*2).write(to:root.appendingPathComponent("icon_\(size)x\(size)@2x.png"))}
try draw(76,true).write(to:root.deletingLastPathComponent().appendingPathComponent("TrayIcon.png"))
