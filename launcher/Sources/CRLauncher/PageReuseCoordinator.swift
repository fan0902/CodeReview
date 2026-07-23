import AppKit
import Foundation

private struct RefreshResponse: Decodable {
  let refreshed: Bool
}

@MainActor
struct PageReuseCoordinator {
  let requestRefresh: (ServiceState) async -> Bool
  let open: (URL) -> Bool
  let activate: (URL) -> Void

  func reuse(_ state: ServiceState) async -> Bool {
    if await requestRefresh(state) {
      activate(state.launchURL)
      return true
    }
    return open(state.launchURL)
  }

  func openNew(_ state: ServiceState) -> Bool {
    open(state.launchURL)
  }

  static func requestRefresh(
    _ state: ServiceState,
    transport: (URLRequest) async throws -> (Data, URLResponse)
  ) async -> Bool {
    var request = URLRequest(url: state.reopenURL)
    request.httpMethod = "POST"
    request.timeoutInterval = 2
    request.setValue("Bearer \(state.token)", forHTTPHeaderField: "Authorization")
    request.setValue(state.origin, forHTTPHeaderField: "Origin")
    do {
      let (data, response) = try await transport(request)
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
      return (try? JSONDecoder().decode(RefreshResponse.self, from: data).refreshed) == true
    } catch {
      return false
    }
  }

  static func system(open: @escaping (URL) -> Bool) -> PageReuseCoordinator {
    PageReuseCoordinator(
      requestRefresh: { state in
        await PageReuseCoordinator.requestRefresh(state) { request in
          try await URLSession.shared.data(for: request)
        }
      },
      open: open,
      activate: { url in
        guard
          let applicationURL = NSWorkspace.shared.urlForApplication(toOpen: url),
          let bundleIdentifier = Bundle(url: applicationURL)?.bundleIdentifier,
          let application = NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleIdentifier)
            .first
        else { return }
        _ = application.activate(options: [.activateIgnoringOtherApps])
      }
    )
  }
}
