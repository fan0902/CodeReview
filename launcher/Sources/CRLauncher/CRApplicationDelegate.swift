import AppKit
import Foundation

@MainActor
protocol ServiceManaging: AnyObject {
  func launchOrReuse() async throws
  func stopService()
}

extension ServiceLauncher: ServiceManaging {}

struct OpenRequestGate {
  private(set) var isActive = false

  mutating func begin() -> Bool {
    guard !isActive else { return false }
    isActive = true
    return true
  }

  mutating func end() { isActive = false }
}

@MainActor
final class CRApplicationDelegate: NSObject, NSApplicationDelegate {
  private let service: ServiceManaging
  private var gate = OpenRequestGate()

  init(service: ServiceManaging) {
    self.service = service
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    installMainMenu()
    requestOpen(terminateOnFailure: true)
  }

  func applicationShouldHandleReopen(
    _ sender: NSApplication,
    hasVisibleWindows flag: Bool
  ) -> Bool {
    requestOpen(terminateOnFailure: false)
    return true
  }

  func applicationWillTerminate(_ notification: Notification) {
    service.stopService()
  }

  private func requestOpen(terminateOnFailure: Bool) {
    guard gate.begin() else { return }
    Task { [weak self] in
      guard let self else { return }
      defer { gate.end() }
      do {
        try await service.launchOrReuse()
      } catch {
        present(error)
        if terminateOnFailure { NSApplication.shared.terminate(nil) }
      }
    }
  }

  private func present(_ error: Error) {
    let alert = NSAlert()
    alert.alertStyle = .critical
    alert.messageText = "CR 无法启动"
    alert.informativeText = error.localizedDescription
    alert.runModal()
  }

  private func installMainMenu() {
    let mainMenu = NSMenu()
    let appItem = NSMenuItem()
    mainMenu.addItem(appItem)

    let appMenu = NSMenu(title: "CR")
    appMenu.addItem(
      withTitle: "关于 CR",
      action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
      keyEquivalent: ""
    )
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(
      withTitle: "隐藏 CR",
      action: #selector(NSApplication.hide(_:)),
      keyEquivalent: "h"
    )
    appMenu.addItem(
      withTitle: "退出 CR",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q"
    )
    appItem.submenu = appMenu
    NSApplication.shared.mainMenu = mainMenu
  }
}
