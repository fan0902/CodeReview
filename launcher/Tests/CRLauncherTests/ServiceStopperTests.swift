import Darwin
import Foundation
import Testing
@testable import CRLauncher

@Suite
struct ServiceStopperTests {
  @Test
  func stopsValidatedProcessAndRemovesState() throws {
    let fixture = try StopFixture()
    var terminated: [Int32] = []
    let stopper = ServiceStopper(
      validator: fixture.validator(actualExecutable: fixture.executable),
      terminate: { terminated.append($0) }
    )

    stopper.stop(stateURL: fixture.stateURL)

    #expect(terminated == [fixture.state.pid])
    #expect(!FileManager.default.fileExists(atPath: fixture.stateURL.path))
  }

  @Test
  func doesNotStopMismatchedProcessAndRemovesStaleState() throws {
    let fixture = try StopFixture()
    var terminated: [Int32] = []
    let stopper = ServiceStopper(
      validator: fixture.validator(actualExecutable: "/different/node"),
      terminate: { terminated.append($0) }
    )

    stopper.stop(stateURL: fixture.stateURL)

    #expect(terminated.isEmpty)
    #expect(!FileManager.default.fileExists(atPath: fixture.stateURL.path))
  }

  @Test
  func doesNotStopProcessForCorruptState() throws {
    let fixture = try StopFixture(writeValidState: false)
    var terminated: [Int32] = []
    let stopper = ServiceStopper(
      validator: fixture.validator(actualExecutable: fixture.executable),
      terminate: { terminated.append($0) }
    )

    stopper.stop(stateURL: fixture.stateURL)

    #expect(terminated.isEmpty)
    #expect(!FileManager.default.fileExists(atPath: fixture.stateURL.path))
  }
}

private struct StopFixture {
  let directory: URL
  let stateURL: URL
  let executable = "/portable/runtime/node"
  let state: ServiceState

  init(writeValidState: Bool = true) throws {
    directory = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    stateURL = directory.appendingPathComponent("service.json")
    state = ServiceState(pid: 4242, port: 4123, token: "token", uid: getuid(), executable: executable)
    let data = writeValidState ? try JSONEncoder().encode(state) : Data("broken".utf8)
    try data.write(to: stateURL)
  }

  func validator(actualExecutable: String) -> ServiceStateValidator {
    ServiceStateValidator(
      expectedUID: getuid(),
      expectedExecutable: executable,
      processExists: { $0 == state.pid },
      executableForPID: { $0 == state.pid ? actualExecutable : nil }
    )
  }
}
