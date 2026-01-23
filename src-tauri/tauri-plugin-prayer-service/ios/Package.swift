// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "tauri-plugin-prayer-service",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(
            name: "tauri-plugin-prayer-service",
            type: .static,
            targets: ["tauri-plugin-prayer-service"]
        )
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-prayer-service",
            dependencies: [
                .product(name: "Tauri", package: "Tauri")
            ],
            path: "Sources"
        )
    ]
)
