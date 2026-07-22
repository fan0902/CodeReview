import AppKit
import Foundation

@main
enum CRLauncherMain {
  @MainActor
  static func main() {
    let application = NSApplication.shared
    application.setActivationPolicy(.regular)
    do {
      let delegate = CRApplicationDelegate(service: try ServiceLauncher())
      application.delegate = delegate
      withExtendedLifetime(delegate) {
        application.run()
      }
    } catch {
      let alert = NSAlert()
      alert.alertStyle = .critical
      alert.messageText = "CR 无法启动"
      alert.informativeText = error.localizedDescription
      alert.runModal()
    }
  }
}
