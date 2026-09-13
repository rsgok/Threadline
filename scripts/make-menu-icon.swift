import AppKit
// Native template mark: outlined curved stem and solid overlay; no background tile.
final class MenuMark: NSView {
 override var isFlipped: Bool { true }
 override func draw(_ dirtyRect: NSRect) {
  // An outlined curved stem sits behind a slimmer solid crossbar.
  let stem = NSBezierPath()
  stem.move(to: NSPoint(x:34,y:43))
  // Taper into a softly curved tip instead of a straight, cut-off stem.
  stem.curve(to: NSPoint(x:55,y:9),controlPoint1: NSPoint(x:31,y:24),controlPoint2: NSPoint(x:43,y:13))
  stem.curve(to: NSPoint(x:61,y:15),controlPoint1: NSPoint(x:62,y:6),controlPoint2: NSPoint(x:65,y:10))
  stem.curve(to: NSPoint(x:58,y:33),controlPoint1: NSPoint(x:57,y:21),controlPoint2: NSPoint(x:56,y:26))
  stem.curve(to: NSPoint(x:61,y:56),controlPoint1: NSPoint(x:60,y:41),controlPoint2: NSPoint(x:61,y:48))
  stem.curve(to: NSPoint(x:84,y:80),controlPoint1: NSPoint(x:61,y:75),controlPoint2: NSPoint(x:64,y:77))
  stem.curve(to: NSPoint(x:87,y:85),controlPoint1: NSPoint(x:88,y:81),controlPoint2: NSPoint(x:89,y:81))
  stem.curve(to: NSPoint(x:59,y:94),controlPoint1: NSPoint(x:82,y:96),controlPoint2: NSPoint(x:74,y:99))
  stem.curve(to: NSPoint(x:34,y:62),controlPoint1: NSPoint(x:43,y:91),controlPoint2: NSPoint(x:33,y:79))
  stem.close()
  let p=NSBezierPath();p.lineWidth=6.2;p.lineCapStyle = .round;p.lineJoinStyle = .round
  // Crossbar: rounded, solid ribbon, rising gently to the right.
  p.removeAllPoints();p.move(to:NSPoint(x:17,y:67))
  p.curve(to:NSPoint(x:24,y:47),controlPoint1:NSPoint(x:13,y:54),controlPoint2:NSPoint(x:16,y:51))
  p.curve(to:NSPoint(x:78,y:30),controlPoint1:NSPoint(x:39,y:39),controlPoint2:NSPoint(x:63,y:31))
  p.curve(to:NSPoint(x:89,y:41),controlPoint1:NSPoint(x:88,y:29),controlPoint2:NSPoint(x:90,y:34))
  p.curve(to:NSPoint(x:80,y:52),controlPoint1:NSPoint(x:89,y:48),controlPoint2:NSPoint(x:86,y:50))
  p.curve(to:NSPoint(x:17,y:67),controlPoint1:NSPoint(x:61,y:59),controlPoint2:NSPoint(x:27,y:61));p.close()
  // Inset outline preserves the approved outer silhouette.
  NSGraphicsContext.saveGraphicsState()
  stem.addClip()
  stem.lineWidth = 12.4
  stem.lineJoinStyle = .round
  stem.lineCapStyle = .round
  NSColor.black.setStroke()
  stem.stroke()
  NSGraphicsContext.restoreGraphicsState()
  NSColor.black.setFill()
  // A thin rounded edge keeps the bar lighter than the previous 6.2-unit outline.
  p.fill()
  p.lineWidth = 2
  NSColor.black.setStroke()
  p.stroke()
 }
}
let view=MenuMark(frame:NSRect(x:0,y:0,width:100,height:100))
try view.dataWithPDF(inside:view.bounds).write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
