import Darwin
import Foundation

struct ServiceState: Codable, Equatable {
  let pid: Int32
  let port: UInt16
  let token: String
  let uid: uid_t
  let executable: String

  var launchURL: URL {
    var components = URLComponents()
    components.scheme = "http"
    components.host = "127.0.0.1"
    components.port = Int(port)
    components.path = "/"
    components.queryItems = [URLQueryItem(name: "token", value: token)]
    return components.url!
  }
}

struct ServiceStateValidator {
  let expectedUID: uid_t
  let expectedExecutable: String
  let processExists: (Int32) -> Bool
  let executableForPID: (Int32) -> String?

  func isReusable(_ state: ServiceState) -> Bool {
    state.uid == expectedUID
      && state.executable == expectedExecutable
      && processExists(state.pid)
      && executableForPID(state.pid) == expectedExecutable
  }

  static func system(expectedExecutable: URL) -> ServiceStateValidator {
    let canonical = expectedExecutable.resolvingSymlinksInPath().path
    return ServiceStateValidator(
      expectedUID: getuid(),
      expectedExecutable: canonical,
      processExists: { kill($0, 0) == 0 },
      executableForPID: { pid in
        var buffer = [UInt8](repeating: 0, count: 4096)
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        guard length > 0 else { return nil }
        return String(decoding: buffer.prefix(Int(length)), as: UTF8.self).resolvingPath
      }
    )
  }
}

struct ServiceStopper {
  let validator: ServiceStateValidator
  let terminate: (Int32) -> Void
  var fileManager: FileManager = .default

  func stop(stateURL: URL) {
    defer { try? fileManager.removeItem(at: stateURL) }
    guard
      let data = try? Data(contentsOf: stateURL),
      let state = try? JSONDecoder().decode(ServiceState.self, from: data),
      validator.isReusable(state)
    else { return }
    terminate(state.pid)
  }

  static func system(expectedExecutable: URL) -> ServiceStopper {
    ServiceStopper(
      validator: .system(expectedExecutable: expectedExecutable),
      terminate: { _ = kill($0, SIGTERM) }
    )
  }
}

private extension String {
  var resolvingPath: String { URL(fileURLWithPath: self).resolvingSymlinksInPath().path }
}
