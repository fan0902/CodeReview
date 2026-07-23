import Darwin
import Foundation
import Testing
@testable import CRLauncher

@Suite(.serialized)
@MainActor
struct PageReuseCoordinatorTests {
  @Test
  func refreshesAndActivatesWithoutOpeningURL() async {
    let recorder = BrowserRecorder()
    let coordinator = PageReuseCoordinator(
      requestRefresh: { _ in true },
      open: { recorder.opened.append($0); return true },
      activate: { recorder.activated.append($0) }
    )
    let state = serviceState()

    #expect(await coordinator.reuse(state))
    #expect(recorder.opened.isEmpty)
    #expect(recorder.activated == [state.launchURL])
  }

  @Test
  func opensURLWhenNoConnectedPageCanRefresh() async {
    let recorder = BrowserRecorder()
    let coordinator = PageReuseCoordinator(
      requestRefresh: { _ in false },
      open: { recorder.opened.append($0); return true },
      activate: { recorder.activated.append($0) }
    )
    let state = serviceState()

    #expect(await coordinator.reuse(state))
    #expect(recorder.opened == [state.launchURL])
    #expect(recorder.activated.isEmpty)
  }

  @Test
  func sendsAuthenticatedRefreshRequest() async {
    let state = serviceState()
    let recorder = RequestRecorder()
    let result = await PageReuseCoordinator.requestRefresh(state) { request in
      recorder.request = request
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 200,
        httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
      )!
      return (Data(#"{"refreshed":true}"#.utf8), response)
    }

    #expect(result)
    #expect(recorder.request?.url == state.reopenURL)
    #expect(recorder.request?.httpMethod == "POST")
    #expect(
      recorder.request?.value(forHTTPHeaderField: "Authorization") == "Bearer secret"
    )
    #expect(recorder.request?.value(forHTTPHeaderField: "Origin") == state.origin)
  }

  @Test
  func treatsInvalidRefreshResponseAsNoConnectedPage() async {
    let state = serviceState()
    let result = await PageReuseCoordinator.requestRefresh(state) { request in
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: 500,
        httpVersion: nil,
        headerFields: nil
      )!
      return (Data(), response)
    }

    #expect(!result)
  }

  private func serviceState() -> ServiceState {
    ServiceState(
      pid: 1,
      port: 43_123,
      token: "secret",
      uid: getuid(),
      executable: "/runtime/node"
    )
  }
}

@MainActor
private final class BrowserRecorder {
  var opened: [URL] = []
  var activated: [URL] = []
}

@MainActor
private final class RequestRecorder {
  var request: URLRequest?
}
