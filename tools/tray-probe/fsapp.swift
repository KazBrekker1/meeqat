// swiftc -O fsapp.swift -o /tmp/fsapp && /tmp/fsapp <display>; kill it to leave full screen.
import Cocoa
// A throwaway app with one window that goes full screen on the given display.
// usage: fsapp <screenIndex>
let idx = Int(CommandLine.arguments[1])!
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let screen = NSScreen.screens[idx]
let f = screen.visibleFrame
let win = NSWindow(contentRect: NSRect(x: f.width / 2 - 300, y: f.height / 2 - 200, width: 600, height: 400),
                   styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false, screen: screen)
win.title = "Tray full-screen test"
win.collectionBehavior = [.fullScreenPrimary]
win.backgroundColor = .darkGray
win.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
  print("window", win.frame, "on", win.screen?.localizedName ?? "nil"); fflush(stdout)
  win.toggleFullScreen(nil)
}
DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
  print("after", win.frame, "on", win.screen?.localizedName ?? "nil", "fullscreen", win.styleMask.contains(.fullScreen)); fflush(stdout)
}
signal(SIGTERM) { _ in exit(0) }
app.run()
