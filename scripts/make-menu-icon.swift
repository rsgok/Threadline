import AppKit
// Native vector geometry for the approved hollow ribbon mark; no background tile.
final class MenuMark: NSView {
 override var isFlipped: Bool { true }
 override func draw(_ dirtyRect: NSRect) {
  NSColor.black.setStroke()
  let p=NSBezierPath();p.lineWidth=6.2;p.lineCapStyle = .round;p.lineJoinStyle = .round
  // Upper stem, behind the diagonal ribbon.
  p.move(to:NSPoint(x:34,y:43));p.line(to:NSPoint(x:34,y:23))
  p.curve(to:NSPoint(x:39,y:14),controlPoint1:NSPoint(x:33,y:19),controlPoint2:NSPoint(x:35,y:17))
  p.curve(to:NSPoint(x:57,y:5),controlPoint1:NSPoint(x:44,y:10),controlPoint2:NSPoint(x:53,y:6))
  p.curve(to:NSPoint(x:61,y:8),controlPoint1:NSPoint(x:60,y:4),controlPoint2:NSPoint(x:61,y:5))
  p.line(to:NSPoint(x:61,y:33));p.stroke()
  // Crossbar: rounded, hollow ribbon, rising gently to the right.
  p.removeAllPoints();p.move(to:NSPoint(x:17,y:67))
  p.curve(to:NSPoint(x:24,y:47),controlPoint1:NSPoint(x:13,y:54),controlPoint2:NSPoint(x:16,y:51))
  p.curve(to:NSPoint(x:78,y:30),controlPoint1:NSPoint(x:39,y:39),controlPoint2:NSPoint(x:63,y:31))
  p.curve(to:NSPoint(x:89,y:41),controlPoint1:NSPoint(x:88,y:29),controlPoint2:NSPoint(x:90,y:34))
  p.curve(to:NSPoint(x:80,y:52),controlPoint1:NSPoint(x:89,y:48),controlPoint2:NSPoint(x:86,y:50))
  p.curve(to:NSPoint(x:17,y:67),controlPoint1:NSPoint(x:61,y:59),controlPoint2:NSPoint(x:27,y:61));p.stroke()
  // Underlap and lower stem.
  p.removeAllPoints();p.move(to:NSPoint(x:17,y:67))
  p.curve(to:NSPoint(x:36,y:76),controlPoint1:NSPoint(x:18,y:73),controlPoint2:NSPoint(x:27,y:76));p.stroke()
  p.removeAllPoints();p.move(to:NSPoint(x:34,y:62))
  p.curve(to:NSPoint(x:59,y:94),controlPoint1:NSPoint(x:33,y:79),controlPoint2:NSPoint(x:43,y:91))
  p.curve(to:NSPoint(x:87,y:85),controlPoint1:NSPoint(x:74,y:99),controlPoint2:NSPoint(x:82,y:96))
  p.curve(to:NSPoint(x:84,y:80),controlPoint1:NSPoint(x:89,y:81),controlPoint2:NSPoint(x:88,y:81))
  p.curve(to:NSPoint(x:61,y:56),controlPoint1:NSPoint(x:64,y:77),controlPoint2:NSPoint(x:61,y:75));p.stroke()
 }
}
let view=MenuMark(frame:NSRect(x:0,y:0,width:100,height:100))
try view.dataWithPDF(inside:view.bounds).write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
