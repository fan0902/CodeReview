// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "CRLauncher",
  platforms: [.macOS(.v13)],
  products: [.executable(name: "CR", targets: ["CRLauncher"])],
  targets: [
    .executableTarget(name: "CRLauncher"),
    .testTarget(name: "CRLauncherTests", dependencies: ["CRLauncher"]),
  ]
)
