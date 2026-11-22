// Clicks Meeqat's menu-bar item on one display and measures where the tray
// popover lands relative to it. Moves the real cursor for ~2 s and puts it back.
//
//   swiftc -O probe.swift -o /tmp/tray-probe
//   /tmp/tray-probe <pid>                          # list displays and the item's frame
//   /tmp/tray-probe <pid> click <display> [reveal] [watch <pid>] [keep]
//
//   reveal       rest the cursor at the top edge first (full-screen Space: menu bar is hidden)
//   watch <pid>  report whether that app's full-screen window stays on screen
//   keep         leave the popover open (to screenshot it)
//
// Good: "panel centre − item centre" within ±1 pt (unless clamped at a screen
// edge), "gap below menu bar item" 13.5 pt on a notched display / 9 pt on an
// external one, "on clicked screen: true". Run it for every display, and again
// after the popover was last shown on a different display.
//
// Needs Accessibility permission for the terminal. No second monitor at hand:
// vdisplay.m makes a virtual one; fsapp.swift puts a full-screen window on a
// display. To test a build next to the installed app, give it another identifier:
//   bun tauri build --debug --no-bundle --config '{"identifier":"com.meeqat.devcheck"}'
import Cocoa
import ApplicationServices

let pid = pid_t(CommandLine.arguments[1])!
let sys = AXUIElementCreateSystemWide()
let primaryH = NSScreen.screens[0].frame.height

func pidAt(_ x: CGFloat, _ y: CGFloat) -> pid_t? {
  var el: AXUIElement?
  guard AXUIElementCopyElementAtPosition(sys, Float(x), Float(y), &el) == .success, let e = el else { return nil }
  var p: pid_t = 0
  AXUIElementGetPid(e, &p)
  return p
}

func axFrames() -> [CGRect] {
  let app = AXUIElementCreateApplication(pid)
  var bar: CFTypeRef?
  guard AXUIElementCopyAttributeValue(app, "AXExtrasMenuBar" as CFString, &bar) == .success else { return [] }
  var kids: CFTypeRef?
  guard AXUIElementCopyAttributeValue(bar as! AXUIElement, kAXChildrenAttribute as CFString, &kids) == .success else { return [] }
  var out: [CGRect] = []
  for k in (kids as! [AXUIElement]) {
    var pv: CFTypeRef?, sv: CFTypeRef?
    AXUIElementCopyAttributeValue(k, kAXPositionAttribute as CFString, &pv)
    AXUIElementCopyAttributeValue(k, kAXSizeAttribute as CFString, &sv)
    var p = CGPoint.zero, s = CGSize.zero
    if let pv = pv { AXValueGetValue(pv as! AXValue, .cgPoint, &p) }
    if let sv = sv { AXValueGetValue(sv as! AXValue, .cgSize, &s) }
    out.append(CGRect(origin: p, size: s))
  }
  return out
}

struct Scr { let name: String; let frame: CGRect; let scale: CGFloat }  // CG coords (top-left origin)
let screens = NSScreen.screens.map { s -> Scr in
  let f = s.frame
  return Scr(name: s.localizedName, frame: CGRect(x: f.minX, y: primaryH - f.maxY, width: f.width, height: f.height), scale: s.backingScaleFactor)
}

func scan(_ s: Scr) -> CGRect? {
  var minX: CGFloat? = nil, maxX: CGFloat = 0
  var x = s.frame.maxX - 2
  while x > s.frame.minX {
    if pidAt(x, s.frame.minY + 12) == pid {
      if minX == nil { maxX = x }
      minX = x
    } else if minX != nil { break }
    x -= 3
  }
  guard let lo = minX else { return nil }
  return CGRect(x: lo, y: s.frame.minY, width: maxX - lo, height: 24)
}

func panelBounds() -> CGRect? {
  let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
  for w in list {
    guard (w[kCGWindowOwnerPID as String] as? pid_t) == pid, (w[kCGWindowLayer as String] as? Int) == 25 else { continue }
    guard (w[kCGWindowIsOnscreen as String] as? Bool) == true else { continue }
    let b = w[kCGWindowBounds as String] as! [String: CGFloat]
    let r = CGRect(x: b["X"]!, y: b["Y"]!, width: b["Width"]!, height: b["Height"]!)
    if r.width > 200 { return r }
  }
  return nil
}

let src = CGEventSource(stateID: .hidSystemState)
func post(_ type: CGEventType, _ p: CGPoint) {
  let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: p, mouseButton: .left)!
  if type != .mouseMoved { e.setIntegerValueField(.mouseEventClickState, value: 1) }
  e.post(tap: .cghidEventTap)
}
func click(_ p: CGPoint) {
  post(.mouseMoved, CGPoint(x: p.x - 4, y: p.y)); usleep(150_000)
  post(.mouseMoved, p); usleep(250_000)
  post(.leftMouseDown, p); usleep(110_000)
  post(.leftMouseUp, p)
}

print("AX extras frames:", axFrames())
for (i, s) in screens.enumerated() {
  print("screen", i, s.name, s.frame, "scale", s.scale, "item via hit-test:", scan(s) as Any)
}

if CommandLine.arguments.count >= 4, CommandLine.arguments[2] == "click" {
  let idx = Int(CommandLine.arguments[3])!
  let s = screens[idx]
  let saved = CGEvent(source: nil)!.location
  if let open = panelBounds() { print("RESULT popover already open at", open, "— close it first"); exit(3) }
  let args = CommandLine.arguments
  let reveal = args.contains("reveal")
  let watchPid: pid_t? = args.firstIndex(of: "watch").flatMap { pid_t(args[$0 + 1]) }
  // Is the watched app's big window (a full-screen one) on screen, and where?
  func watched() -> String {
    guard let wp = watchPid else { return "" }
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
    for w in list where (w[kCGWindowOwnerPID as String] as? pid_t) == wp {
      let b = w[kCGWindowBounds as String] as! [String: CGFloat]
      if b["Width"]! > 1000 { return "full-screen window on screen at \(b["X"]!),\(b["Y"]!) \(b["Width"]!)x\(b["Height"]!)" }
    }
    return "full-screen window NOT on screen"
  }
  if watchPid != nil { print("RESULT before:", watched()) }
  if reveal {
    // In a full-screen Space the menu bar slides down when the cursor rests at the top edge.
    post(.mouseMoved, CGPoint(x: s.frame.maxX - 700, y: s.frame.minY + 40)); usleep(200_000)
    post(.mouseMoved, CGPoint(x: s.frame.maxX - 700, y: s.frame.minY + 2)); usleep(100_000)
    post(.mouseMoved, CGPoint(x: s.frame.maxX - 700, y: s.frame.minY)); usleep(1_500_000)
  }
  // The item's AX frame is reported on one display only; menu bars lay their
  // status items out identically from the right edge, so mirror it to this one.
  func itemOn(_ s: Scr) -> CGRect? {
    guard let ax = axFrames().first else { return scan(s) }
    if s.frame.contains(CGPoint(x: ax.midX, y: ax.midY)) { return ax }
    guard let home = screens.first(where: { $0.frame.contains(CGPoint(x: ax.midX, y: ax.midY)) }) else { return nil }
    return CGRect(x: s.frame.maxX - (home.frame.maxX - ax.minX), y: s.frame.minY + (ax.minY - home.frame.minY), width: ax.width, height: ax.height)
  }
  guard var exact = itemOn(s) else { print("RESULT screen", idx, "item not found"); post(.mouseMoved, saved); exit(2) }
  let target = CGPoint(x: exact.midX, y: s.frame.minY + 12)
  // A scripted click on an inactive display's menu bar only activates it (system
  // items behave the same), so a second click may be needed.
  var clicks = 0
  var t0 = Date()
  var panel: CGRect? = nil
  while panel == nil && clicks < 3 {
    click(target); clicks += 1
    t0 = Date()
    while panel == nil && Date().timeIntervalSince(t0) < 2.5 { usleep(40_000); panel = panelBounds() }
  }
  let openMs = Int(Date().timeIntervalSince(t0) * 1000)
  usleep(400_000); panel = panelBounds()
  if let now = itemOn(s) { exact = now }   // exact once this display is the active one
  print("RESULT screen", idx, s.name, "item", exact, "panel", panel as Any)
  if watchPid != nil { print("RESULT with popover open:", watched()) }
  if let p = panel {
    let dx = p.midX - exact.midX
    let onScreen = s.frame.contains(CGPoint(x: p.midX, y: p.midY))
    print("RESULT   panel centre − item centre = \(dx) pt; gap below menu bar item = \(p.minY - exact.maxY) pt; on clicked screen: \(onScreen)")
    print("RESULT   appeared \(openMs) ms after mouse-up (clicks needed: \(clicks))")
    if args.contains("keep") { exit(0) }
    click(target)   // close it again
    let t1 = Date()
    while panelBounds() != nil && Date().timeIntervalSince(t1) < 4 { usleep(40_000) }
    usleep(700_000)
    print("RESULT   closed:", panelBounds() == nil, "after \(Int(Date().timeIntervalSince(t1) * 1000) - 700) ms")
  }
  post(.mouseMoved, saved)
}
