import AppKit
import Foundation
import Security

enum LauncherError: LocalizedError {
  case missingResource(String)
  case invalidStartup
  case serviceUnavailable

  var errorDescription: String? {
    switch self {
    case .missingResource(let path): "CR 缺少运行资源：\(path)"
    case .invalidStartup: "CR 本地服务启动信息无效。"
    case .serviceUnavailable: "CR 本地服务未能就绪。"
    }
  }
}

final class ServiceLauncher {
  private let resources: URL
  private let support: URL

  init(resources: URL = Bundle.main.resourceURL!) throws {
    self.resources = resources
    if ProcessInfo.processInfo.environment["CR_TEST_MODE"] == "1",
       let testSupport = ProcessInfo.processInfo.environment["CR_APP_SUPPORT_DIR"] {
      support = URL(fileURLWithPath: testSupport, isDirectory: true)
    } else {
      let base = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
      support = base.appendingPathComponent("CR", isDirectory: true)
    }
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
  }

  func launchOrReuse() async throws {
    let node = resources.appendingPathComponent("runtime/node")
    let server = resources.appendingPathComponent("server/main.js")
    let web = resources.appendingPathComponent("web")
    for resource in [node, server, web] where !FileManager.default.fileExists(atPath: resource.path) {
      throw LauncherError.missingResource(resource.path)
    }
    let stateURL = support.appendingPathComponent("service.json")
    let validator = ServiceStateValidator.system(expectedExecutable: node)
    if let state = try? loadState(stateURL), validator.isReusable(state), await healthy(state) {
      guard NSWorkspace.shared.open(state.launchURL) else { throw LauncherError.serviceUnavailable }
      return
    }
    try? FileManager.default.removeItem(at: stateURL)

    let token = try secureToken()
    let process = Process()
    process.executableURL = node
    process.arguments = [server.path, "--host", "127.0.0.1", "--port", "0", "--token", token]
    process.currentDirectoryURL = resources
    var environment = ProcessInfo.processInfo.environment
    environment["CR_WEB_ROOT"] = web.path
    environment["NODE_PATH"] = resources.appendingPathComponent("node_modules").path
    process.environment = environment
    let output = Pipe()
    let errors = Pipe()
    process.standardOutput = output
    process.standardError = errors
    try process.run()

    let data = output.fileHandleForReading.availableData
    guard
      let line = String(data: data, encoding: .utf8)?.split(separator: "\n").first,
      let json = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
      let portValue = json["port"] as? Int,
      let port = UInt16(exactly: portValue)
    else {
      process.terminate()
      throw LauncherError.invalidStartup
    }
    let state = ServiceState(
      pid: process.processIdentifier,
      port: port,
      token: token,
      uid: getuid(),
      executable: node.resolvingSymlinksInPath().path
    )
    try saveState(state, to: stateURL)
    guard await healthy(state), NSWorkspace.shared.open(state.launchURL) else {
      process.terminate()
      throw LauncherError.serviceUnavailable
    }
  }

  func stopService() {
    let node = resources.appendingPathComponent("runtime/node")
    let stateURL = support.appendingPathComponent("service.json")
    ServiceStopper.system(expectedExecutable: node).stop(stateURL: stateURL)
  }

  private func healthy(_ state: ServiceState) async -> Bool {
    var request = URLRequest(url: URL(string: "http://127.0.0.1:\(state.port)/api/health")!)
    request.timeoutInterval = 2
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
      return String(data: data, encoding: .utf8)?.contains("\"name\":\"CR\"") == true
    } catch { return false }
  }

  private func loadState(_ url: URL) throws -> ServiceState {
    try JSONDecoder().decode(ServiceState.self, from: Data(contentsOf: url))
  }

  private func saveState(_ state: ServiceState, to url: URL) throws {
    let data = try JSONEncoder().encode(state)
    try data.write(to: url, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
  }

  private func secureToken() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      throw LauncherError.invalidStartup
    }
    return Data(bytes).base64EncodedString()
  }
}
