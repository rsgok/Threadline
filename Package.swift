// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Rewind",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "Rewind", targets: ["Rewind"]), .executable(name: "Threadline", targets: ["Threadline"])],
    targets: [
        .target(name: "RewindCore"),
        .executableTarget(name: "Threadline"),
        .executableTarget(name: "Rewind", dependencies: ["RewindCore"]),
        .testTarget(name: "RewindCoreTests", dependencies: ["RewindCore"])
    ]
)
