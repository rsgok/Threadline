// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Rewind",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "Rewind", targets: ["Rewind"]), .executable(name: "Threadline", targets: ["Threadline"])],
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.6")],
    targets: [
        .target(name: "RewindCore"),
        .executableTarget(name: "Threadline", dependencies: ["RewindCore", .product(name: "Sparkle", package: "Sparkle")], linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
        .executableTarget(name: "Rewind", dependencies: ["RewindCore"]),
        .testTarget(name: "RewindCoreTests", dependencies: ["RewindCore"])
    ]
)
