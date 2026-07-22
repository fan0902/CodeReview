import AppKit
import Testing
@testable import CRLauncher

@Suite(.serialized)
@MainActor
struct CRApplicationDelegateTests {
  @Test
  func openRequestGateRejectsConcurrentRequestAndResets() {
    var gate = OpenRequestGate()
    let first = gate.begin()
    let concurrent = gate.begin()
    #expect(first)
    #expect(!concurrent)
    gate.end()
    let afterReset = gate.begin()
    #expect(afterReset)
  }

  @Test
  func lifecycleRequestsOpenAndStopsService() async {
    let service = RecordingServiceManager()
    let delegate = CRApplicationDelegate(service: service)

    delegate.applicationDidFinishLaunching(
      Notification(name: NSApplication.didFinishLaunchingNotification)
    )
    await waitUntil { service.launchCount == 1 }

    #expect(
      delegate.applicationShouldHandleReopen(NSApplication.shared, hasVisibleWindows: false)
    )
    await waitUntil { service.launchCount == 2 }

    delegate.applicationWillTerminate(
      Notification(name: NSApplication.willTerminateNotification)
    )
    #expect(service.stopCount == 1)
  }

  private func waitUntil(_ condition: @escaping () -> Bool) async {
    for _ in 0..<100 {
      if condition() { return }
      await Task.yield()
    }
    #expect(condition())
  }
}

@MainActor
private final class RecordingServiceManager: ServiceManaging {
  var launchCount = 0
  var stopCount = 0

  func launchOrReuse() async throws { launchCount += 1 }
  func stopService() { stopCount += 1 }
}
